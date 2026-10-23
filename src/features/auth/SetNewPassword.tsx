import React, { useState } from 'react';
import { tr } from '../../lib/i18n';

/** Shown after a password-reset link signs the user in: choose the new password. */
export function SetNewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError(tr('Use at least 8 characters.')); return; }
    if (password !== confirm) { setError(tr('The two passwords do not match.')); return; }
    setBusy(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      onDone();
    } catch (err: any) {
      setError(err.message || tr('Could not save the new password'));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <form onSubmit={save} className="w-full max-w-sm p-8 glass-panel space-y-4">
        <h2 className="text-xl font-bold">{tr('Set a new password')}</h2>
        {/* the hidden username lets Chrome's password manager store the new password for the right account */}
        <input type="email" name="email" autoComplete="username" hidden readOnly />
        <div className="space-y-2">
          <label htmlFor="new-password" className="text-xs uppercase font-bold tracking-wider opacity-60">{tr('New password')}</label>
          <input id="new-password" name="new-password" type="password" autoComplete="new-password" value={password}
            onChange={e => setPassword(e.target.value)} className="login-search-input !text-base" required />
        </div>
        <div className="space-y-2">
          <label htmlFor="confirm-password" className="text-xs uppercase font-bold tracking-wider opacity-60">{tr('Repeat it')}</label>
          <input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" value={confirm}
            onChange={e => setConfirm(e.target.value)} className="login-search-input !text-base" required />
        </div>
        {error && <p className="text-red-400 text-xs py-2">{error}</p>}
        <button type="submit" disabled={busy} className="button w-full !py-4 font-bold uppercase tracking-widest">
          {busy ? tr('Saving...') : tr('Save password')}
        </button>
      </form>
    </div>
  );
}
