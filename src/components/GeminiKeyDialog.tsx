import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, XCircle } from 'lucide-react';
import { tr } from '../lib/i18n';
import { setGeminiKey } from '../lib/ai/keys';
import { GEMINI_KEY_REQUEST_EVENT, type GeminiKeyRequest } from '../lib/ai/keyPrompt';
import { AI_CONFIG_EVENT } from '../lib/ai/providerKeys';
import { Dialog, Field, Input, Key } from './ui';

/** Mounted once at the app root; opened by requestGeminiKey(). */
export function GeminiKeyDialog() {
    const [req, setReq] = useState<GeminiKeyRequest | null>(null);
    const [draft, setDraft] = useState('');
    const [test, setTest] = useState<'idle' | 'busy' | 'ok' | 'fail'>('idle');
    const reqRef = useRef<GeminiKeyRequest | null>(null);
    reqRef.current = req;

    useEffect(() => {
        const onRequest = (e: Event) => {
            const next = (e as CustomEvent<GeminiKeyRequest>).detail;
            // A second ask while one is open joins the first answer.
            if (reqRef.current) {
                const first = reqRef.current;
                reqRef.current = { ...first, resolve: (v) => { first.resolve(v); next.resolve(v); } };
                setReq(reqRef.current);
                return;
            }
            setDraft('');
            setTest('idle');
            setReq(next);
        };
        window.addEventListener(GEMINI_KEY_REQUEST_EVENT, onRequest);
        return () => window.removeEventListener(GEMINI_KEY_REQUEST_EVENT, onRequest);
    }, []);

    if (!req) return null;

    const close = (saved: boolean) => { req.resolve(saved); setReq(null); setDraft(''); };
    const save = () => {
        const key = draft.trim();
        if (!key) return;
        setGeminiKey(key);
        try { window.dispatchEvent(new Event(AI_CONFIG_EVENT)); } catch { /* status lines refresh on next read */ }
        close(true);
    };
    const runTest = async () => {
        const key = draft.trim();
        if (!key) return;
        setTest('busy');
        try {
            const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': key } });
            setTest(res.ok ? 'ok' : 'fail');
        } catch {
            setTest('fail');
        }
    };

    return (
        <div className="fixed inset-0 z-[100050]">
            <Dialog title={tr('Gemini API key')} onCancel={() => close(false)}
                actions={<>
                    <Key onClick={() => close(false)}>{tr('Cancel')}</Key>
                    <Key disabled={!draft.trim() || test === 'busy'} busy={test === 'busy'} onClick={runTest}>{tr('Test')}</Key>
                    <Key variant="go" icon={<KeyRound size={13} />} disabled={!draft.trim()} onClick={save}>{tr('Save')}</Key>
                </>}>
                {req.reason && <p>{req.reason}</p>}
                <p>{tr('Saved only on this device')}</p>
                <Field label={tr('API key')}>
                    <Input type="password" mono autoComplete="off" value={draft} placeholder={tr('AIzaSy...')}
                        onChange={(e) => { setDraft(e.target.value); setTest('idle'); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
                </Field>
                {test === 'ok' && <p role="status"><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {tr('Key works')}</p>}
                {test === 'fail' && <p role="status"><XCircle size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {tr('Key was rejected or Google is unreachable')}</p>}
            </Dialog>
        </div>
    );
}
