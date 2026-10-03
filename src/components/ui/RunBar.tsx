import React from 'react';
import { tr } from '../../lib/i18n';
import { cx, itemStateLabel, type ItemState } from './types';

/** Draw order of the track, left to right: finished work first, waiting last. */
const ORDER: readonly ItemState[] = ['saved', 'done', 'review', 'partial', 'running', 'failed', 'skipped', 'queued'];

export interface RunBarProps {
    /** How many items are in each state. States left out count as zero. */
    counts: Partial<Record<ItemState, number>>;
    /** Total for the track; defaults to the sum of counts. */
    total?: number;
    /** A note beside the track, e.g. "about 2 min left". Already translated. */
    note?: React.ReactNode;
    /** Stop / Retry failed / Save reviewed keys. */
    actions?: React.ReactNode;
    /** Slot before the legend, e.g. a run label. */
    start?: React.ReactNode;
    className?: string;
}

/**
 * The run at a glance: a track segmented by state (so a failure is a red
 * slice, not a shorter bar), a legend with the counts, and the actions that
 * act on the run. The track is a progressbar whose value is the items that
 * are no longer waiting or running.
 */
export function RunBar({ counts, total, note, actions, start, className }: RunBarProps) {
    const sum = ORDER.reduce((n, s) => n + (counts[s] ?? 0), 0);
    // A total larger than the counts means items not in any state yet; they
    // are waiting, so they widen the track without counting as finished.
    const all = Math.max(total ?? sum, sum);
    const finished = sum - (counts.queued ?? 0) - (counts.running ?? 0);
    const present = ORDER.filter(s => (counts[s] ?? 0) > 0);
    const summary = present.map(s => `${counts[s]} ${itemStateLabel(s).toLowerCase()}`).join(', ');

    return (
        <div className={cx('ui-runbar', className)}>
            {start}
            <ul className="ui-legend" aria-hidden="true">
                {present.map(s => (
                    <li key={s} data-run={s}>{counts[s]} {itemStateLabel(s).toLowerCase()}</li>
                ))}
            </ul>
            <div
                className="ui-runbar__track"
                role="progressbar"
                aria-label={tr('Run progress')}
                aria-valuemin={0}
                aria-valuemax={all || 1}
                aria-valuenow={Math.max(0, finished)}
                aria-valuetext={summary || tr('Nothing queued')}
            >
                {all > 0 && ORDER.map(s => {
                    const n = counts[s] ?? 0;
                    if (!n) return null;
                    return <i key={s} className="ui-runbar__seg" data-run={s} style={{ width: `${(n / all) * 100}%` }} />;
                })}
            </div>
            {note && <span className="ui-runbar__note">{note}</span>}
            {actions && <div className="ui-runbar__actions">{actions}</div>}
        </div>
    );
}
