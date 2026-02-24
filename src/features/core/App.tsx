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
import { Login } from '../auth/Login';
import { MainAppView } from './MainAppView';
import { SCRIPT_URL } from '../../lib/consts';

export default function App() {
  const [user, setUser] = useAtom(userAtom);
  const theme = useAtomValue(themeAtom);
  const performanceMode = useAtomValue(performanceModeAtom);

  useEffect(() => {
    import('../../lib/supabase').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata.name || session.user.email?.split('@')[0] || 'User',
            role: (session.user.user_metadata.role as any) || 'Vendor',
          });
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata.name || session.user.email?.split('@')[0] || 'User',
            role: (session.user.user_metadata.role as any) || 'Vendor',
          });
        } else {
          setUser(null);
        }
      });

      return () => subscription.unsubscribe();
    });
  }, [setUser]);

  useEffect(() => {
    // Robust theme switching: remove old themes before adding the new one.
    const themeClasses = ['theme-concrete', 'theme-nacar', 'theme-orange', 'theme-cherry', 'theme-forest', 'theme-terra', 'theme-calcite', 'theme-fluorite'];
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
      {user ? <MainAppView /> : <Login />}
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