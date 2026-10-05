import React, { useMemo, useRef } from 'react';
import { m } from 'framer-motion';
import { MessageCircle, Bell } from 'lucide-react';
import type { ToolDescriptor } from '../../lib/toolRegistry';
import { tr } from '../../lib/i18n';
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
      className="flex flex-col p-4 gap-6 w-full"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.04 } } }}
    >
      {groups.map(([groupName, groupTools], gIdx) => (
        <div key={groupName} className="flex flex-col gap-2">
          <m.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }} className="text-[11px] font-bold uppercase tracking-wider text-white/40 px-1">
            {groupName}
          </m.div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {groupTools.map((tool, tIdx) => {
              if (tool.kind === 'widget' && tool.render) {
                return (
                  <m.div 
                    key={tool.id} 
                    id={`tile-${tool.id}`}
                    variants={{ hidden: { opacity: 0, scale: 0.96, y: 4 }, show: { opacity: 1, scale: 1, y: 0 } }}
                    className="col-span-2 md:col-span-3 xl:col-span-4 isl-w5 rounded-xl p-3 border border-white/10 overflow-y-auto max-h-[60vh]"
                  >
                    {tool.render()}
                  </m.div>
                );
              }
              const Icon = tool.icon;
              const isToggle = tool.kind === 'toggle';
              return (
                <m.button
                  key={tool.id}
                  id={`tile-${tool.id}`}
                  type="button"
                  title={tool.title || tool.label}
                  aria-pressed={isToggle ? !!tool.pressed : undefined}
                  disabled={tool.disabled}
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); tool.run?.(); }}
                  onKeyDown={(e: React.KeyboardEvent) => handleKeyDown(e, gIdx, tIdx)}
                  tabIndex={gIdx === 0 && tIdx === 0 ? 0 : -1}
                  variants={{ hidden: { opacity: 0, scale: 0.96, y: 4 }, show: { opacity: 1, scale: 1, y: 0 } }}
                  whileTap={!tool.disabled ? { scale: 0.95 } : undefined}
                  className="group flex items-center gap-3 p-2 min-h-[44px] rounded-xl cursor-pointer isl-hw10 transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed border border-transparent text-left text-white"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full isl-w10 shrink-0 relative text-white group-aria-pressed:bg-transparent">
                    <Icon size={22} color="currentColor" strokeWidth={2} />
                    {tool.badge != null && (
                      <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-blue-500 rounded-full border border-[var(--glass-tint,rgba(10,12,20,0.4))] shadow-sm" />
                    )}
                  </div>
                  <span className="text-[13px] font-medium group-aria-pressed:font-bold max-w-[12ch] truncate flex-1 leading-tight text-white/90 group-aria-pressed:text-white">
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
