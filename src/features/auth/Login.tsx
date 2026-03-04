

import { useSetAtom } from 'jotai/react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { userAtom, User } from '../../lib/atoms';
import { useTranslation, useNotify } from '../../lib/hooks';
import { appUsers, vendors } from '../../lib/consts';
import { OnyxLogo } from '../../components/OnyxLogo';
import userIcons from '../../components/userIcons';

export function Login() {
  const t = useTranslation();
  const notify = useNotify();
  const setUser = useSetAtom(userAtom);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    import('../../lib/supabase').then(async ({ supabase }) => {
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: email.split('@')[0],
            role: 'Vendor'
          }
        }
      });
      if (error) {
        setError(error.message);
      } else {
        notify.success("Check your email for confirmation!");
        setIsRegistering(false);
      }
      setLoading(false);
    });
  };

  return (
    <div className="relative w-full h-screen flex items-center justify-center overflow-hidden">
      <div className="w-full max-w-md p-8 glass-panel z-10">
        <div className="text-center mb-8">
          <OnyxLogo className="w-24 h-24 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">{isRegistering ? 'Create Account' : t.welcome}</h1>
          <p className="text-[var(--text-color-secondary)] text-sm mt-2">
            {isRegistering ? 'Join the Onyx.mx network' : 'Secure Enterprise Access'}
          </p>
        </div>

        <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs uppercase font-bold tracking-wider opacity-60">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="login-search-input !text-base"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase font-bold tracking-wider opacity-60">Security Key</label>
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
            {loading ? 'Authenticating...' : (isRegistering ? 'Register' : 'Enter System')}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/10 text-center">
          <button
            onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
            className="text-sm text-[var(--text-color-secondary)] hover:text-white transition-colors"
          >
            {isRegistering ? 'Already have access? Log in' : 'Need partner access? Request Registration'}
          </button>
        </div>
      </div>
    </div>
  );
}
