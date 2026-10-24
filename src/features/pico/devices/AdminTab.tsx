import React, { useState, useEffect } from 'react';
import { useAtomValue } from 'jotai/react';
import { AlertCircle, ChevronDown, ChevronRight, Key, User, RotateCcw, ShieldBan, ShieldAlert, RefreshCw, Database } from 'lucide-react';
import { tr } from '../../../lib/i18n';
import type { DeviceState } from '../surfaces/types';
import { relativeTime } from '../surfaces/format';
import { useNow } from '../surfaces/useDeviceFleet';
import { useDeviceAdmin, AdminDevice, Assignment } from './useDeviceAdmin';
import { supabase } from '../../../lib/supabase';
import { userAtom, inventoryAtom } from '../../../lib/atoms';
import { isCompanionAvailable } from '../../../lib/ai/embeddings';
import { syncItemEmbeddingsToSupabase, SyncProgressUpdate } from '../../../lib/embeddings/syncToSupabase';

const ConfirmActionDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ isOpen, onClose, onConfirm, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-white/10 p-6 rounded-xl max-w-md w-full space-y-4 shadow-2xl">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <div className="text-sm text-neutral-400">{children}</div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-lg transition-colors">
            {tr('Cancel')}
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-bold bg-white text-black hover:bg-neutral-200 rounded-lg transition-colors">
            {tr('Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

interface AdminTabProps {
  devices: DeviceState[];
}

function getTokenState(dev: AdminDevice, now: number) {
  if (!dev.token_issued_at) {
    return { key: 'No token', colorClass: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30' };
  }
  if (dev.revoked_at || dev.token_revoked_at) {
    return { key: 'Revoked', colorClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30' };
  }
  if (dev.expires_at) {
    const exp = Date.parse(dev.expires_at);
    if (!Number.isNaN(exp)) {
      if (exp <= now) {
        return { key: 'Expired', colorClass: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30' };
      }
      if (exp - now <= 7 * 24 * 3600 * 1000) {
        return { key: 'Expiring within 7 days', colorClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      }
    }
  }
  return { key: 'Active', colorClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
}

const ExpandableRow: React.FC<{
  device: AdminDevice;
  assignment?: Assignment;
  now: number;
  onChanged: () => void;
}> = ({ device, assignment, now, onChanged }) => {
  const [expanded, setExpanded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'issue' | 'rotate' | 'revoke' | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  // the raw token exists only here, once: the database keeps just its hash
  const [newToken, setNewToken] = useState('');
  const [copied, setCopied] = useState(false);

  const tokenState = getTokenState(device, now);
  const hasToken = !!device.token_issued_at && !device.token_revoked_at && !device.revoked_at;

  const onConfirm = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    setBusy(true);
    setActionError('');
    try {
      if (action === 'revoke') {
        const { error } = await (supabase as any).rpc('revoke_device_token', { p_device_id: device.device_id });
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).rpc('issue_device_token', { p_device_id: device.device_id });
        if (error) throw error;
        setNewToken(String(data));
        return; // refresh only after the token is hidden: a refresh remounts this row and would lose it
      }
      onChanged();
    } catch (err: any) {
      setActionError(err.message || tr('The action failed'));
    } finally {
      setBusy(false);
    }
  };

  const actionTooltip = tr('This action is not available yet.');

  return (
    <>
      <tr 
        onClick={() => setExpanded(!expanded)}
        className="group cursor-pointer hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-none"
      >
        <td className="p-4 align-top w-10">
          <button className="text-neutral-500 group-hover:text-neutral-300">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="p-4 align-top">
          <div className="font-bold text-sm text-white mb-0.5">{device.device_name || device.device_id}</div>
          <div className="text-[10px] font-mono text-neutral-500">{device.device_id}</div>
        </td>
        <td className="p-4 align-top text-xs text-neutral-300">
          <div>{device.hardware_model || '-'}</div>
          <div className="text-[10px] text-neutral-500 mt-0.5 uppercase tracking-wide">{device.role || '-'}</div>
        </td>
        <td className="p-4 align-top text-xs text-neutral-300">
          {device.firmware_version || '-'}
        </td>
        <td className="p-4 align-top">
          <div className="space-y-2">
            <span className={`inline-flex px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-widest ${tokenState.colorClass}`}>
              {tr(tokenState.key)}
            </span>
            <div className="text-[10px] text-neutral-500">
              {tr('Token Last Used')}: {relativeTime(device.token_last_used_at, now)}
            </div>
          </div>
        </td>
        <td className="p-4 align-top text-xs text-neutral-300">
          {assignment ? (
            <div className="flex items-center gap-1.5">
              <User size={12} className="text-cyan-400" />
              <span className="truncate max-w-[120px]" title={assignment.user_id}>{assignment.user_id}</span>
            </div>
          ) : (
            <span className="text-neutral-500 italic">{tr('Unassigned')}</span>
          )}
        </td>
        <td className="p-4 align-top text-xs font-mono text-neutral-400">
          {relativeTime(device.last_checkin_at, now)}
        </td>
      </tr>
      
      {expanded && (
        <tr className="bg-black/20 border-b border-white/5">
          <td colSpan={7} className="p-4 pl-14">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{tr('Actions')}</h4>
                <div className="flex flex-wrap gap-2">
                  <button 
                    disabled={busy || hasToken}
                    onClick={() => setConfirmAction('issue')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-200 hover:bg-neutral-700 text-xs font-bold border border-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Key size={14} />
                    {tr('Issue token')}
                  </button>
                  <button 
                    disabled={busy || !hasToken}
                    onClick={() => setConfirmAction('rotate')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-200 hover:bg-neutral-700 text-xs font-bold border border-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RotateCcw size={14} />
                    {tr('Rotate token')}
                  </button>
                  <button 
                    title={actionTooltip}
                    disabled
                    onClick={() => undefined}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-500 text-xs font-bold border border-white/5 opacity-50 cursor-not-allowed"
                  >
                    <User size={14} />
                    {tr('Assign to user')}
                  </button>
                  <button 
                    disabled={busy || !hasToken}
                    onClick={() => setConfirmAction('revoke')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 text-xs font-bold border border-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ShieldBan size={14} />
                    {tr('Revoke device')}
                  </button>
                </div>
                {/* Explain revocation clearly as requested */}
                <div className="flex items-start gap-1.5 text-[10px] text-rose-400/80 bg-rose-500/5 p-2 rounded-lg border border-rose-500/10">
                  <ShieldAlert size={12} className="shrink-0 mt-px" />
                  <p>{tr('Revoking drops the live session and blocks the device until a new token is issued.')}</p>
                </div>
                {actionError && <p className="text-[11px] text-rose-400">{actionError}</p>}
                {newToken && (
                  <div className="space-y-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                    <p className="text-[11px] text-amber-300">{tr('Copy this token now and paste it into the device setup page. It is shown only once.')}</p>
                    <input readOnly value={newToken} onFocus={e => e.currentTarget.select()} aria-label={tr('New device token')}
                      className="w-full font-mono text-[11px] bg-black/40 border border-white/10 rounded px-2 py-1 text-neutral-200" />
                    <div className="flex gap-2">
                      <button onClick={() => navigator.clipboard.writeText(newToken).then(() => setCopied(true), () => setActionError(tr('Copy failed: select the token and press Ctrl+C')))} className="px-3 py-1 text-xs font-bold text-neutral-200 bg-white/5 hover:bg-white/10 rounded border border-white/10">{copied ? tr('Copied') : tr('Copy')}</button>
                      <button onClick={() => { setNewToken(''); setCopied(false); onChanged(); }} className="px-3 py-1 text-xs font-bold text-neutral-400 hover:bg-white/5 rounded">{tr('Done, hide it')}</button>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{tr('Token History')}</h4>
                <div className="text-xs text-neutral-400 space-y-2 font-mono">
                  <div className="flex justify-between">
                    <span>{tr('Issued')}</span>
                    <span className="text-white">{device.token_issued_at ? new Date(device.token_issued_at).toLocaleString() : tr('Never')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{tr('Last Used')}</span>
                    <span className="text-white">{device.token_last_used_at ? new Date(device.token_last_used_at).toLocaleString() : tr('Never')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{tr('Expires')}</span>
                    <span className="text-white">{device.expires_at ? new Date(device.expires_at).toLocaleString() : tr('Never')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{tr('Revoked')}</span>
                    <span className={device.revoked_at || device.token_revoked_at ? 'text-rose-400' : 'text-white'}>
                      {device.revoked_at ? new Date(device.revoked_at).toLocaleString() : device.token_revoked_at ? new Date(device.token_revoked_at).toLocaleString() : tr('Never')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}

      <ConfirmActionDialog
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={onConfirm}
        title={tr('Are you sure?')}
      >
        <p>{confirmAction === 'revoke'
          ? tr('The device stops working until a new token is issued.')
          : confirmAction === 'rotate'
            ? tr('The current token stops working. The device needs the new one.')
            : tr('A new token is created and shown once.')}</p>
      </ConfirmActionDialog>
    </>
  );
};

export const AdminTab: React.FC<AdminTabProps> = ({ devices: _telemetryDevices }) => {
  const { status, devices, assignments, error, refresh } = useDeviceAdmin();
  const now = useNow();
  const user = useAtomValue(userAtom);
  const inventoryItems = useAtomValue(inventoryAtom);
  const [companionAvailable, setCompanionAvailable] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressUpdate | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const isAdmin = user?.role === 'Developer' || user?.role === 'Admin';

  useEffect(() => {
    let active = true;
    isCompanionAvailable().then(avail => {
      if (active) setCompanionAvailable(avail);
    }).catch(() => {
      if (active) setCompanionAvailable(false);
    });
    return () => { active = false; };
  }, []);

  const handleSyncEmbeddings = async () => {
    if (!companionAvailable || isSyncing || !isAdmin) return;
    setIsSyncing(true);
    setSyncProgress(null);
    setSyncMessage(null);

    try {
      // item_embeddings.item_id has a foreign key to inventory(id): a production row in the
      // batch throws and fails the whole sync, every run. inventoryAtom mixes both sources.
      let itemsToSync = inventoryItems
        .filter((x: any) => x.source !== 'production')
        .map((x: any) => x.data ?? x);
      if (itemsToSync.length === 0) {
        const { data } = await supabase.from('inventory').select('*');
        if (data) itemsToSync = data;
      }

      const res = await syncItemEmbeddingsToSupabase(itemsToSync, {
        onProgress: (prog) => {
          setSyncProgress(prog);
        },
      });

      if (!res.completed) {
        if (res.modelMismatch) {
          setSyncMessage({
            text: `${tr('Model mismatch')}: expected ${res.modelMismatch.expected}, got ${res.modelMismatch.actual}`,
            isError: true,
          });
        } else {
          setSyncMessage({
            text: tr('Embedding sync interrupted or failed'),
            isError: true,
          });
        }
      } else {
        setSyncMessage({
          text: `${tr('Embeddings synced successfully')}: ${res.recordsToUpsert.length} ${tr('updated')}, ${res.planned.upToDate} ${tr('up to date')}.`,
        });
      }
    } catch (err: any) {
      setSyncMessage({
        text: err?.message || tr('Failed to sync embeddings'),
        isError: true,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const embeddingsCard = (
    <div className="rounded-xl bg-black/40 border border-white/5 p-4 space-y-3 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">{tr('Item Embeddings')}</h3>
          </div>
          <p className="text-xs text-neutral-400">
            {tr('Sync vector embeddings for semantic search in inventory.')}
          </p>
        </div>
        <div>
          <button
            disabled={!companionAvailable || isSyncing || !isAdmin}
            onClick={handleSyncEmbeddings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-200 hover:bg-neutral-700 text-xs font-bold border border-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin text-cyan-400' : ''} />
            {isSyncing ? tr('Syncing...') : tr('Sync Embeddings')}
          </button>
        </div>
      </div>

      {!companionAvailable && (
        <div className="flex items-start gap-2 text-xs text-neutral-400 bg-white/[0.03] p-2.5 rounded-lg border border-white/5">
          <AlertCircle size={14} className="text-neutral-500 shrink-0 mt-0.5" />
          <p>{tr('Open this page in the OnyxCompanion iOS app to sync embeddings')}</p>
        </div>
      )}

      {syncProgress && syncProgress.stage === 'embedding' && (
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-[11px] font-mono text-neutral-400">
            <span>{tr('Syncing embeddings...')}</span>
            <span>{syncProgress.current} / {syncProgress.total}</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-300"
              style={{ width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {syncMessage && (
        <p className={`text-xs ${syncMessage.isError ? 'text-rose-400' : 'text-emerald-400'}`}>
          {syncMessage.text}
        </p>
      )}
    </div>
  );

  if (status === 'loading') {
    return (
      <div className="py-8 text-center">
        <p className="text-xs font-semibold text-neutral-500">{tr('Loading...')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {embeddingsCard}
        <div className="py-8 text-center space-y-3">
          <p className="text-xs font-semibold text-rose-400">{error}</p>
          <button 
            onClick={refresh}
            className="px-3 py-1.5 text-xs font-bold text-neutral-300 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
          >
            {tr('Refresh')}
          </button>
        </div>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="space-y-4">
        {embeddingsCard}
        <div className="py-8 text-center">
          <p className="text-xs font-semibold text-neutral-500">{tr('No devices found.')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {embeddingsCard}
      <div className="rounded-xl bg-black/40 border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-black/20">
                <th className="w-10 p-4"></th>
                <th className="p-4 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{tr('Device ID')}</th>
                <th className="p-4 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{tr('Hardware Model')}</th>
                <th className="p-4 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{tr('Firmware')}</th>
                <th className="p-4 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{tr('Token State')}</th>
                <th className="p-4 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{tr('Assigned User')}</th>
                <th className="p-4 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{tr('Last Check-in')}</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <ExpandableRow 
                  key={d.device_id} 
                  device={d} 
                  assignment={assignments.find(a => a.device_id === d.device_id)}
                  now={now}
                  onChanged={refresh}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminTab;
