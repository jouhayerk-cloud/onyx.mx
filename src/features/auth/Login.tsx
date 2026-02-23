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

import { useSetAtom } from 'jotai/react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { userAtom, User } from '../../lib/atoms';
import { useTranslation } from '../../lib/hooks';
import { appUsers, vendors } from '../../lib/consts';
import { OnyxLogo } from '../../components/OnyxLogo';
import userIcons from '../../components/userIcons';

export function Login() {
  const t = useTranslation();
  const setUser = useSetAtom(userAtom);

  // New state machine for login flow
  const [step, setStep] = useState<'initial' | 'search' | 'pin'>('initial');
  const [searchText, setSearchText] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Auto-login on correct 5-digit PIN
  useEffect(() => {
    if (pin.length === 5 && selectedUserId) {
      console.log(`[Login] Attempting PIN validation for user: ${selectedUserId}`);
      const userToLogin = appUsers[selectedUserId as keyof typeof appUsers];
      if (userToLogin && userToLogin.pin === pin) {
        console.log('[Login] PIN correct. Logging in user.');

        const getEmailForRole = (role: User['role'], id: string) => {
          switch (role) {
            case 'Admin': return `${id.toLowerCase()}@admin.com`;
            case 'Client': return `${id.toLowerCase()}@client.com`;
            case 'Vendor':
            default: return `${id.toLowerCase()}@vendor.com`;
          }
        }

        setUser({
          id: selectedUserId,
          email: (userToLogin as any).email || getEmailForRole(userToLogin.role, selectedUserId),
          name: userToLogin.name,
          role: userToLogin.role,
        });
      } else {
        console.warn('[Login] Incorrect PIN entered.');
        setError(t.incorrectPin);
        setTimeout(() => {
          setPin('');
          setError('');
          pinInputRef.current?.focus();
        }, 1500);
      }
    }
  }, [pin, selectedUserId, setUser, t]);

  // Focus inputs when step changes
  useEffect(() => {
    if (step === 'search') {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else if (step === 'pin') {
      setTimeout(() => pinInputRef.current?.focus(), 500); // Wait for transition
    }
  }, [step]);

  const handleUserSelect = (userId: string) => {
    console.log(`[Login] User profile selected: ${userId}`);
    setSelectedUserId(userId);
    setStep('pin');
    setError('');
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*$/.test(value) && value.length <= 5) {
      setPin(value);
    }
  };

  const handleBack = () => {
    if (step === 'pin') {
      setPin('');
      setError('');
      setSelectedUserId(null);
      setStep('search');
    } else if (step === 'search') {
      setSearchText('');
      setStep('initial');
    }
  };

  const filteredUsers = useMemo(() => {
    if (searchText.length < 3) return [];
    const lowercasedSearch = searchText.toLowerCase();
    return Object.entries(appUsers).filter(([, user]) =>
      (user as { name: string }).name.toLowerCase().includes(lowercasedSearch)
    );
  }, [searchText]);

  const selectedUser = selectedUserId ? appUsers[selectedUserId as keyof typeof appUsers] : null;
  const SelectedUserIcon = selectedUserId ? userIcons[selectedUserId as keyof typeof userIcons] : null;

  return (
    <div className="relative w-full h-screen flex items-center justify-center overflow-hidden">
      <div className={`w-full max-w-lg p-8 ${step !== 'initial' ? 'glass-panel' : ''} z-10 transition-all duration-500 ease-in-out login-container step-${step}`}>
        {step !== 'initial' && (
          <button
            onClick={handleBack}
            className="absolute top-4 left-4 text-2xl opacity-50 hover:opacity-100 z-20">
            &larr;
          </button>
        )}

        {step === 'initial' && (
          <div className="text-center">
            <div className="login-logo-wrapper" onClick={() => setStep('search')}>
              <OnyxLogo className="w-80 h-80" />
            </div>
          </div>
        )}

        {(step === 'search' || step === 'pin') && (
          <div className="login-form-wrapper">
            {/* Search View */}
            <div className="login-search-view">
              <h1 className="text-2xl font-bold text-center mb-6">{t.welcome}</h1>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Start typing your name..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="login-search-input"
              />
              {searchText.length >= 3 && (
                <div className="login-results-list">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map(([id, user]) => {
                      const UserIcon = userIcons[id as keyof typeof userIcons];
                      return (
                        <button
                          key={id}
                          onClick={() => handleUserSelect(id)}
                          className="login-result-item"
                        >
                          <div className="login-result-avatar">
                            {UserIcon && <UserIcon className="w-full h-full rounded-full" />}
                          </div>
                          <span>{(user as { name: string }).name}</span>
                        </button>
                      )
                    })
                  ) : (
                    <p className="login-no-results">No users found.</p>
                  )}
                </div>
              )}
            </div>

            {/* PIN View */}
            <div className="login-pin-view">
              {selectedUser && SelectedUserIcon && (
                <div className="flex flex-col items-center text-center">
                  <div className="login-pin-avatar">
                    <SelectedUserIcon className="w-full h-full rounded-full" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold">{(selectedUser as { name: string }).name}</h2>
                  <p className="mt-2 text-sm text-[var(--text-color-secondary)]">{t.enterPinPrompt}</p>
                  <div className="mt-6">
                    <input
                      ref={pinInputRef}
                      type="password"
                      inputMode="numeric"
                      value={pin}
                      onChange={handlePinChange}
                      maxLength={5}
                      className={`login-pin-input ${error ? 'border-red-500 animate-shake' : 'border-[var(--border-color)] focus:border-[var(--accent-color)]'}`}
                    />
                  </div>
                  {error && <p className="mt-4 text-red-400 text-sm h-5">{error}</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
