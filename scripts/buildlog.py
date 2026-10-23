"""Build log 2.0: one entry per deploy day on origin/main, summarised by the local Colibri model.

Usage: py -3 scripts/buildlog.py [--since 2026-04-24] [--no-ai]
Writes src/assets/BUILDLOG.md (shown in Settings and About) and keeps scripts/.buildlog-cache.json so a re-run only
summarises days that are new or changed. Version of an entry = "2.0." + the 7-char hash of the day's last commit
(0a38331 -> 2.0.0a38331). Without Colibri a day falls back to its commit subjects; nothing is lost.
"""
import json, os, subprocess, sys, urllib.request
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'BUILDLOG.md')
CACHE = os.path.join(ROOT, 'scripts', '.buildlog-cache.json')
COLIBRI = 'http://127.0.0.1:8000/v1/chat/completions'
MAX_SUBJECTS = 40  # a busy day stays inside the 4B model's context

def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', check=True).stdout

def days(since):
    log = git('log', '--first-parent', 'origin/main', f'--since={since}', '--format=%h%x09%ad%x09%s', '--date=short', '--abbrev=7')
    out = OrderedDict()  # newest day first, commits newest first
    for line in log.splitlines():
        h, d, s = line.split('\t', 2)
        out.setdefault(d, []).append((h, s))
    return out

def summarise(subjects):
    body = {
        'model': 'qwen3.6-colibri', 'temperature': 0.2, 'max_tokens': 300,
        'messages': [
            {'role': 'system', 'content': 'You write release notes for the Onyx.mx inventory app. Plain English, no emoji, no markdown headers, no commit hashes.'},
            {'role': 'user', 'content': 'Turn these commits from one day into 1 to 5 short bullet lines starting with "- ". Group related commits; keep feature names as written.\n' + '\n'.join(subjects[:MAX_SUBJECTS])},
        ],
    }
    req = urllib.request.Request(COLIBRI, json.dumps(body).encode(), {'Content-Type': 'application/json'})
    text = json.loads(urllib.request.urlopen(req, timeout=180).read())['choices'][0]['message']['content']
    if '</think>' in text: text = text.split('</think>', 1)[1]
    lines = [l.strip() for l in text.splitlines() if l.strip().startswith('- ')]
    if not lines: raise ValueError('no bullet lines')
    return lines

def main():
    since = sys.argv[sys.argv.index('--since') + 1] if '--since' in sys.argv else '2026-04-24'
    use_ai = '--no-ai' not in sys.argv
    try: cache = json.load(open(CACHE, encoding='utf-8'))
    except (OSError, ValueError): cache = {}
    all_days = days(since)
    md = ['# Build log', '', 'One entry per deploy day on main. Version 2.0.<commit>. Summaries written by the local Colibri model.', '']
    for i, (day, commits) in enumerate(all_days.items()):
        head = commits[0][0]
        hit = cache.get(day)
        if not hit or hit['head'] != head or (use_ai and hit.get('source') != 'colibri'):
            subjects = [s for _, s in commits]
            try:
                if not use_ai: raise RuntimeError('ai off')
                hit = {'head': head, 'lines': summarise(subjects), 'source': 'colibri'}
            except Exception as e:
                if use_ai: print(f'{day}: Colibri failed ({e}); using commit subjects', file=sys.stderr)
                hit = {'head': head, 'lines': ['- ' + s for s in subjects], 'source': 'git'}
            cache[day] = hit
            json.dump(cache, open(CACHE, 'w', encoding='utf-8'), indent=1)  # saved per day, so a stopped run resumes
            print(f'[{i + 1}/{len(all_days)}] {day} {head} {hit["source"]}', flush=True)
        md += [f'## [2.0.{head}] - {day}', f'### {len(commits)} commit(s)', *hit['lines'], '']
    open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(md))
    print(f'wrote {OUT}: {len(all_days)} days')

if __name__ == '__main__':
    main()
