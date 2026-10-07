import React, { useMemo, useRef } from 'react';
import { m } from 'framer-motion';
import { MessageCircle, Bell } from 'lucide-react';
import type { ToolDescriptor } from '../../lib/toolRegistry';
import { tr } from '../../lib/i18n';
import { TactileSwitch } from '../../components/TactileSwitch';
import { useIslandNotifications } from './notify/store';

interface IslandToolsGridProps {
  tools: ToolDescriptor[];
  filter: string;
  onRun: (tool: ToolDescriptor) => void;
  onOpenPane: (pane: 'chat' | 'notifications') => void;
}

export const IslandToolsGrid: React.FC<IslandToolsGridProps> = ({ tools, filter, onRun, onOpenPane }) => {
  const { unread } = useIslandNotifications();
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedFilter = filter.trim().toLowerCase();

  const groups = useMemo(() => {
    const onyxTools: ToolDescriptor[] = [
      {
        id: 'onyx-assistant',
        moduleId: 'global',
        label: tr('Assistant'),
        icon: MessageCircle,
        kind: 'action',
        group: 'Onyx',
        order: 0,
        run: () => onOpenPane('chat'),
      },
      {
        id: 'onyx-notifications',
        moduleId: 'global',
        label: tr('Notifications'),
        icon: Bell,
        kind: 'action',
        group: 'Onyx',
        order: 1,
        badge: unread > 0 ? unread : undefined,
        run: () => onOpenPane('notifications'),
      }
    ];

    const all = [...onyxTools, ...tools];
    const filtered = all.filter(t => !normalizedFilter || t.label.toLowerCase().includes(normalizedFilter));

    const map = new Map<string, ToolDescriptor[]>();
    for (const t of filtered) {
      if (!map.has(t.group)) map.set(t.group, []);
      map.get(t.group)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === 'Onyx') return -1;
      if (b[0] === 'Onyx') return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [tools, normalizedFilter, onOpenPane, unread]);

  const handleKeyDown = (e: React.KeyboardEvent, groupIndex: number, toolIndex: number) => {
    if (!containerRef.current) return;
    const buttons = Array.from(containerRef.current.querySelectorAll('[role="button"], button:not(:disabled)')) as HTMLElement[];
    const currentIndex = buttons.indexOf(e.currentTarget as HTMLElement);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    // VERY simple grid approximation by relying on DOM order
    if (e.key === 'ArrowRight') {
      nextIndex = Math.min(currentIndex + 1, buttons.length - 1);
    } else if (e.key === 'ArrowLeft') {
      nextIndex = Math.max(currentIndex - 1, 0);
    } else if (e.key === 'ArrowDown') {
      // Find the one visually below? Actually DOM order is fine for + cols
      nextIndex = Math.min(currentIndex + 2, buttons.length - 1); // Approximation
    } else if (e.key === 'ArrowUp') {
      nextIndex = Math.max(currentIndex - 2, 0);
    } else {
      return;
    }
    e.preventDefault();
    buttons[nextIndex]?.focus();
  };

  if (groups.length === 0) {
    return <div className="p-4 text-center text-[13px] text-white/50">{tr('No tools match')}</div>;
  }

  return (
    <m.div 
      ref={containerRef} 
      role="tablist" 
      className="flex flex-col p-2 gap-3 w-full"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.04 } } }}
    >
      {groups.map(([groupName, groupTools], gIdx) => (
        <div key={groupName} className="flex flex-col gap-2">
          <m.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }} className="text-[11px] font-bold uppercase tracking-wider text-white/40 px-1">
            {groupName}
          </m.div>
          <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-1.5">
            {groupTools.map((tool, tIdx) => {
              if (tool.kind === 'widget' && tool.render) {
                return (
                  <m.div 
                    key={tool.id} 
                    id={`tile-${tool.id}`}
                    variants={{ hidden: { opacity: 0, scale: 0.96, y: 4 }, show: { opacity: 1, scale: 1, y: 0 } }}
                    className="col-span-3 md:col-span-4 xl:col-span-5 isl-w5 rounded-xl p-3 border border-white/10 overflow-y-auto max-h-[60vh]"
                  >
                    {tool.render()}
                  </m.div>
                );
              }
              const isToggle = tool.kind === 'toggle';
              const Icon = tool.icon;
              
              if (isToggle) {
                return (
                  <m.div
                    key={tool.id}
                    id={`tile-${tool.id}`}
                    variants={{ hidden: { opacity: 0, scale: 0.96, y: 4 }, show: { opacity: 1, scale: 1, y: 0 } }}
                    className="flex items-center justify-center p-2 min-h-[44px]"
                  >
                    <TactileSwitch 
                        active={!!tool.pressed} 
                        onChange={() => { if (!tool.disabled) tool.run?.(); }} 
                        label={tool.label} 
                    />
                  </m.div>
                );
              }
              return (
                <m.button
                  key={tool.id}
                  id={`tile-${tool.id}`}
                  type="button"
                  title={tool.title || tool.label}
                  aria-pressed={undefined}
                  disabled={tool.disabled}
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); tool.run?.(); }}
                  onKeyDown={(e: React.KeyboardEvent) => handleKeyDown(e, gIdx, tIdx)}
                  tabIndex={gIdx === 0 && tIdx === 0 ? 0 : -1}
                  variants={{ hidden: { opacity: 0, scale: 0.96, y: 4 }, show: { opacity: 1, scale: 1, y: 0 } }}
                  whileTap={!tool.disabled ? { scale: 0.95 } : undefined}
                  className="group flex flex-col items-center justify-center gap-1.5 p-1.5 min-h-[44px] rounded-xl cursor-pointer hover:bg-white/5 transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed border border-transparent text-center text-white"
                >
                  <div className="flex items-center justify-center w-11 h-11 rounded-full bg-white/10 shrink-0 relative text-white">
                    <Icon size={22} color="currentColor" strokeWidth={1.5} />
                    {tool.badge != null && (
                      <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-[var(--main-color,#00aeef)] rounded-full shadow-sm" />
                    )}
                  </div>
                  <span className="text-[12px] font-medium leading-tight text-white/70 group-hover:text-white">
                    {tool.label}
                  </span>
                </m.button>
              );
            })}
          </div>
        </div>
      ))}
    </m.div>
  );
};

