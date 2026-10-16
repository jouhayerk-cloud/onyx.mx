

import { useSetAtom } from 'jotai/react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { userAtom, User } from '../../lib/atoms';
import { useTranslation } from '../../lib/hooks';
import { appUsers, vendors } from '../../lib/consts';
import { OnyxLogo } from '../../components/OnyxLogo';
import userIcons from '../../components/userIcons';
import { tr } from '../../lib/i18n';

/** Sign-in screen: email and password form, with a timeout message when the connection stalls. */
export function Login() {
  const t = useTranslation();
  const setUser = useSetAtom(userAtom);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const loginTimeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
        setError('Connection timed out. Check your internet or configuration.');
      }
    }, 10000);

    try {
      const { supabase } = await import('../../lib/supabase');
      if (!supabase || (supabase as any).supabaseUrl.includes('placeholder')) {
        throw new Error('Supabase client not initialized. Check environment variables.');
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      clearTimeout(loginTimeout);

      if (error) {
        setError(error.message);
        setLoading(false);
      }
    } catch (err: any) {
      clearTimeout(loginTimeout);
      setError(err.message || 'Failed to connect to authentication server');
      setLoading(false);
    }
  };

  // Self-registration was removed deliberately. It let anyone create an account,
  // and it passed `role` into user metadata — a value the caller controls, which
  // an RLS policy on onyxchan_devices was trusting for admin access.
  // Accounts are provisioned by an admin: create the auth user, then the matching
  // app_users row. Without that row every RLS policy denies, by design.
  // Removing this UI does not close the /auth/v1/signup endpoint — disable
  // signups in the Supabase dashboard as well.

  return (
    <div className="relative w-full h-screen flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes onyxLogoZoomIn {
          0% { transform: scale(0.65); opacity: 0; filter: drop-shadow(0 0 0 rgba(255,255,255,0)); }
          60% { transform: scale(1.08); opacity: 1; filter: drop-shadow(0 12px 30px rgba(255,255,255,0.22)); }
          100% { transform: scale(1); opacity: 1; filter: drop-shadow(0 8px 24px rgba(0,0,0,0.6)); }
        }
        @keyframes onyxLogoPulseZoom {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 8px 24px rgba(255,255,255,0.18)); }
          50% { transform: scale(1.14); filter: drop-shadow(0 14px 38px rgba(255,255,255,0.42)); }
        }
        .onyx-login-logo {
          animation: onyxLogoZoomIn 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .onyx-login-logo.is-loading {
          animation: onyxLogoPulseZoom 1.5s ease-in-out infinite;
        }
      `}</style>
      <div className="w-full max-w-md p-8 glass-panel z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <OnyxLogo
              className={`w-32 h-32 object-contain onyx-login-logo ${loading ? 'is-loading' : ''}`}
            />
          </div>
          <h1 className="text-2xl font-bold">{t.welcome}</h1>
          <p className="text-[var(--text-color-secondary)] text-sm mt-2">
            {loading ? (
              <span className="text-emerald-400 font-medium tracking-wide animate-pulse">
                Onyx-mx loading...
              </span>
            ) : (
              tr("Secure Enterprise Access")
            )}
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs uppercase font-bold tracking-wider opacity-60">{tr("Email Address")}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={tr("name@company.com")}
              className="login-search-input !text-base"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase font-bold tracking-wider opacity-60">{tr("Security Key")}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="login-search-input !text-base"
              required
            />
          </div>

          {error && <p className="text-red-400 text-xs py-2 animate-shake">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="button w-full !py-4 font-bold uppercase tracking-widest mt-4"
          >
            {loading ? "Onyx-mx loading..." : tr("Enter System")}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/10 text-center">
          <p className="text-sm text-[var(--text-color-secondary)]">
            {tr("Need access? Contact your administrator.")}
          </p>
        </div>
      </div>
    </div>
  );
}

