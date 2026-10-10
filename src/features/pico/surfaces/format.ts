import { tr, trf } from '../../../lib/i18n';

/** "12s ago", "3 min ago", "2 h ago", "4 d ago"; "Never" when there is no timestamp. */
export function relativeTime(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return tr('Never');
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return tr('Never');
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 60) return trf('{n}s ago', { n: s });
  if (s < 3600) return trf('{n} min ago', { n: Math.floor(s / 60) });
  if (s < 86400) return trf('{n} h ago', { n: Math.floor(s / 3600) });
  return trf('{n} d ago', { n: Math.floor(s / 86400) });
}

/** Formats a duration in ms as '350 ms', '2.5 s' or 'N min M s'. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}
