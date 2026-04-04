
import React, { useEffect, useState, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { Toaster } from 'react-hot-toast';
import { themeAtom, userAtom, performanceModeAtom, languageAtom } from '../../lib/atoms';
import { resolveUserRole } from '../../lib/utils';
import { Login } from '../auth/Login';
import { MainAppView } from './MainAppView';
import { SCRIPT_URL } from '../../lib/consts';
import { WelcomePage } from '../auth/WelcomePage';
import { TagView } from '../logistics/TagView';
import { DataSyncProvider } from '../../components/DataSyncProvider';

export default function App() {
  const [user, setUser] = useAtom(userAtom);
  const theme = useAtomValue(themeAtom);
  const performanceMode = useAtomValue(performanceModeAtom);
  const setLanguage = useSetAtom(languageAtom);
  const [showWelcome, setShowWelcome] = useState(false);
  const [tagId, setTagId] = useState<string | null>(null);
  const [view, setView] = useState<'app' | 'tag'>('app');
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  /**
   * UNIVERSAL ID DETECTION - v2.2 Deep Hash & Power Hunt
   * Prioritizes Hash fragments for Google Sites compatibility
   */
  useEffect(() => {
    const findTagInString = (str: string) => {
      if (!str) return null;
      try {
        const decoded = decodeURIComponent(decodeURIComponent(str));
        // Priority 1: Named tagid
        const namedMatch = decoded.match(/tagid[=\-:_ ]*([A-Z0-9\-]{4,20})/i);
        if (namedMatch) return namedMatch[1];
        
        // Priority 2: Direct SU Pattern Hunt (e.g. #SU3261HX)
        const suMatch = decoded.match(/(SU[0-9]{3,}[A-Z]{0,2})/i);
        if (suMatch) return suMatch[1];
        
        return null;
      } catch (e) { return null; }
    };

    const attemptSync = () => {
      // 1. Priority: Hash Fragment (Most durable in Google Sites)
      let id = findTagInString(window.location.hash);
      
      // 2. Next: Referrer (Parent context)
      if (!id) id = findTagInString(document.referrer);
      
      // 3. Fallback: Search params
      if (!id) {
        const params = new URLSearchParams(window.location.search);
        id = params.get('tagid') || params.get('tagID');
      }

      if (id && id !== tagId) {
        setSyncStatus(`Found: ${id}`);
        setTagId(id);
        setView('tag');
        setTimeout(() => setSyncStatus(null), 4000);
        return true;
      }
      return false;
    };

    // Diagnostics
    const ref = document.referrer ? "googleusercontent..." : "None";
    setSyncStatus(`🔍 Syncing... (Ref: ${ref})`);

    let attempts = 0;
    const interval = setInterval(() => {
      if (attemptSync() || attempts > 20) {
          clearInterval(interval);
          if (attempts > 20 && !tagId) setSyncStatus(null);
      }
      attempts++;
    }, 500);

    return () => clearInterval(interval);
  }, [tagId]);

  useEffect(() => {
    // Detect Supabase Confirmation/Recovery links
    const hash = window.location.hash;
    if (hash.includes('type=signup') || hash.includes('type=recovery')) {
      console.log('✅ Activation detected from URL hash.');
      setShowWelcome(true);
      // Clean up hash after a short delay to keep URL clean but allow processing
      setTimeout(() => {
        window.history.replaceState(null, '', window.location.pathname);
      }, 500);
    }
  }, []);

  useEffect(() => {
    import('../../lib/supabase').then(({ supabase }) => {

      const resolveAuthorizedUser = async (session: any) => {
        const email = session.user.email || '';

        const { data: appUser, error } = await supabase
          .from('app_users')
          .select('role, display_name, is_active')
          .eq('email', email.toLowerCase())
          .single();



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

        setUser({
          id: session.user.id,
          email,
          name: appUser.display_name || session.user.user_metadata?.name || email.split('@')[0] || 'User',
          role: appUser.role,
        });

        setLanguage(appUser.role === 'Vendor' ? 'es' : 'en');

        supabase.from('app_users')
          .update({ last_submit_at: new Date().toISOString() })
          .eq('email', email.toLowerCase())
          .then();
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
    // Robustly remove any existing theme classes
    const classes = Array.from(document.documentElement.classList);
    classes.forEach(c => {
      if (c.startsWith('theme-')) document.documentElement.classList.remove(c);
    });
    
    // Apply new theme
    document.documentElement.classList.add(`theme-${theme}`);
  }, [theme]);

  useEffect(() => {
    if (performanceMode) {
      document.documentElement.classList.add('performance-mode-active');
    } else {
      document.documentElement.classList.remove('performance-mode-active');
    }
  }, [performanceMode]);

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
      {syncStatus && (
        <div className="fixed top-0 left-0 right-0 z-[10000] bg-cyan-500/90 text-black text-[10px] py-1 px-4 font-mono flex items-center justify-center animate-pulse">
          {syncStatus}
        </div>
      )}

      {view === 'tag' && tagId ? (
         <TagView tagId={tagId} />
      ) : (
        <>
          <DataSyncProvider />
          {showWelcome && <WelcomePage onComplete={() => setShowWelcome(false)} />}
          {(user as any)?.__denied ? (
            <div className="w-full h-screen flex items-center justify-center">
              <div className="text-center p-8 max-w-sm">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" /></svg>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
                <p className="text-sm text-(--text-color-secondary) mb-6">
                  Your email is not registered for Onyx.mx access. Contact your system administrator.
                </p>
                <button
                  onClick={async () => {
                    const { supabase } = await import('../../lib/supabase');
                    await supabase.auth.signOut();
                    setUser(null);
                  }}
                  className="button w-full py-3! text-sm"
                >
                  Return to Login
                </button>
              </div>
            </div>
          ) : user ? <MainAppView /> : <Login />}
        </>
      )}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3500,
          className: 'toast-liquid-glass'
        }}
      />
    </>
  );
}