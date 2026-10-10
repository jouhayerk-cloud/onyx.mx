import React from 'react';
import { useAtom } from 'jotai/react';
import { visibleWorkbooksAtom } from '../../lib/atoms';
import { WORKBOOK_IDS, type WorkbookId } from '../../lib/seasons';
import { tr } from '../../lib/i18n';
import { TactileSwitch } from '../../components/TactileSwitch';

/**
 * The workbook (season) switches 825, 326 and 826. They live in the View bar of the Universal Tools Bars
 * (InventoryViewPanel); the legacy header (island off) still shows them through MainHeader.
 * Each one is the liquid glass tactile switch used elsewhere in the island.
 */
export const SeasonToggles: React.FC = () => {
    const [visible, setVisible] = useAtom(visibleWorkbooksAtom);
    const flip = (id: WorkbookId) =>
        setVisible(prev => ({ ...prev, [id]: !(prev?.[id] ?? true) }));

    return (
        <div className="season-toggles flex items-center gap-3 shrink-0" role="group" aria-label={tr("Seasons")}>
            {WORKBOOK_IDS.map(id => {
                const on = visible?.[id] ?? true;
                const name = id.replace('v', '');
                return (
                    <div
                        key={id}
                        role="switch"
                        aria-checked={on}
                        aria-label={`${tr("Season")} ${name}`}
                        title={`${on ? 'Hide' : 'Show'} season ${name}`}
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(id); }
                        }}
                        className="season-switch flex flex-col items-center gap-0.5 shrink-0 rounded-full"
                    >
                        <TactileSwitch active={on} onChange={() => flip(id)} width={40} height={22} />
                        <span
                            className="text-[9px] font-black uppercase tracking-[0.1em] leading-none tabular-nums"
                            style={{ color: on ? 'var(--main-color)' : undefined, opacity: on ? 1 : 0.6 }}
                        >
                            {name}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};
