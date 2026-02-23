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

import React from 'react';
import { useAtomValue } from 'jotai/react';
import { notificationsAtom } from '../lib/atoms';

const iconMap = {
    success: '#icon-success',
    error: '#icon-error',
    warning: '#icon-warning',
    notice: '#icon-notice',
};

const SpinnerIcon = () => (
  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export function Notifications() {
  const notifications = useAtomValue(notificationsAtom);

  return (
    <div className="alerts location-top">
      {notifications.map((alert) => (
        <div key={alert.id} className={`alert ${alert.type}`}>
          {alert.type === 'loading' ? (
            <div className="alert-icon">
                <SpinnerIcon />
            </div>
          ) : (
            <svg className="alert-icon">
              <use href={iconMap[alert.type]}></use>
            </svg>
          )}
          {alert.message}
        </div>
      ))}
    </div>
  );
}