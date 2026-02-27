/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { Toaster } from 'react-hot-toast';
import { themeAtom, userAtom, performanceModeAtom } from '../../lib/atoms';
import { resolveUserRole } from '../../lib/utils';
import { Login } from '../auth/Login';
import { MainAppView } from './MainAppView';
import { SCRIPT_URL } from '../../lib/consts';

export default function App() {
  const [user, setUser] = useAtom(userAtom);
  const theme = useAtomValue(themeAtom);
  const performanceMode = useAtomValue(performanceModeAtom);

  useEffect(() => {
    import('../../lib/supabase').then(({ supabase }) => {

      const resolveAuthorizedUser = async (session: any) => {
        const email = session.user.email || '';

        // Try to look up this email in app_users
        const { data: appUser, error } = await supabase
          .from('app_users')
          .select('role, display_name, is_active')
          .eq('email', email.toLowerCase())
          .single();

        // If the table doesn't exist yet (or any unexpected DB error), 
        // fail OPEN — fall back to the hardcoded resolver so existing users 
        // are never locked out during setup.
        if (error && error.code !== 'PGRST116') {
          console.warn('app_users table unavailable, falling back to resolveUserRole.', error.message);
          setUser({
            id: session.user.id,
            email,
            name: session.user.user_metadata?.name || email.split('@')[0] || 'User',
            role: resolveUserRole(email),
          });
          return;
        }

        // Table exists but this email has no registered row, or the row is inactive → deny
        if (!appUser || !appUser.is_active) {
          console.warn('Access denied: email not registered in app_users or is inactive.', email);
          await supabase.auth.signOut();
          setUser({
            id: 'DENIED',
            email,
            name: 'Access Denied',
            role: 'Client',
            __denied: true
          } as any);
          return;
        }

        // Registered and active — grant access with the role from the DB
        setUser({
          id: session.user.id,
          email,
          name: appUser.display_name || session.user.user_metadata?.name || email.split('@')[0] || 'User',
          role: appUser.role,
        });
      };

      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) resolveAuthorizedUser(session);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          resolveAuthorizedUser(session);
        } else {
          setUser(null);
        }
      });

      return () => subscription.unsubscribe();
    });
  }, [setUser]);


  useEffect(() => {
    // Robust theme switching: remove old themes before adding the new one.
    const themeClasses = ['theme-obsidian', 'theme-midnight', 'theme-forest-night', 'theme-snow', 'theme-sand', 'theme-sky'];
    document.documentElement.classList.remove(...themeClasses);
    document.documentElement.classList.add(`theme-${theme}`);
  }, [theme]);

  useEffect(() => {
    if (performanceMode) {
      document.documentElement.classList.add('performance-mode-active');
    } else {
      document.documentElement.classList.remove('performance-mode-active');
    }
  }, [performanceMode]);

  // Define a simple heartbeat to keep the script warm on the free tier if needed
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'heartbeat' }),
      }).catch(err => console.warn("Heartbeat failed:", err));
    }, 5 * 60 * 1000); // every 5 minutes

    return () => clearInterval(intervalId);
  }, []);

  return (
    <>
      {(user as any)?.__denied ? (
        <div className="w-full h-screen flex items-center justify-center">
          <div className="text-center p-8 max-w-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" /></svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
            <p className="text-sm text-[var(--text-color-secondary)] mb-6">
              Your email is not registered for Onyx.mx access. Contact your system administrator.
            </p>
            <button
              onClick={async () => {
                const { supabase } = await import('../../lib/supabase');
                await supabase.auth.signOut();
                setUser(null);
              }}
              className="button w-full !py-3 text-sm"
            >
              Return to Login
            </button>
          </div>
        </div>
      ) : user ? <MainAppView /> : <Login />}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--sidebar-bg)',
            color: 'var(--text-color)',
            border: '1px solid var(--border-color)',
          },
        }}
      />
    </>
  );
}