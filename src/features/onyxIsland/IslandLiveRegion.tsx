import React, { useEffect, useRef, useState } from 'react';
import { useIslandNotifications } from './notify/store';
import { tr } from '../../lib/i18n';

/** Screen-reader region that announces new island notifications; errors are announced assertively. */
export const IslandLiveRegion: React.FC = () => {
  const { current } = useIslandNotifications();
  const [politeText, setPoliteText] = useState('');
  const [assertiveText, setAssertiveText] = useState('');
  
  const lastAnnouncedKey = useRef<string | null>(null);
  const clearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!current) return;
    
    const key = `${current.id}-${current.updatedAt}`;
    if (lastAnnouncedKey.current === key) return;
    
    lastAnnouncedKey.current = key;
    
    let text = '';
    if (current.title || current.message) {
      const titlePart = current.title ? `${current.title}. ` : '';
      text = `${titlePart}${current.message || ''}`;
    } else if (current.render) {
      text = tr('New notification');
    }
    
    if (!text) return;

    // clear first so an identical message announced twice in a row still changes the DOM text
    setAssertiveText('');
    setPoliteText('');
    window.setTimeout(() => {
      if (current.kind === 'error') setAssertiveText(text);
      else setPoliteText(text);
    }, 60);
    
    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current);
    }
    
    clearTimerRef.current = window.setTimeout(() => {
      setPoliteText('');
      setAssertiveText('');
    }, 4000);
    
  }, [current]);

  return (
    <div className="onyx-sr-only">
      <div role="status" aria-live="polite">
        {politeText}
      </div>
      <div role="alert" aria-live="assertive">
        {assertiveText}
      </div>
    </div>
  );
};
