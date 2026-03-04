

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