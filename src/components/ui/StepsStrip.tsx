import { tr } from '../../lib/i18n';
import { PROCESS_META, cx, itemStateLabel, type ProcessId, type ProcessState } from './types';

export interface Step {
    /** A process id, or any key for a step that is not a catalog process. */
    id: ProcessId | string;
    state: ProcessState;
    /** Square letter; defaults to PROCESS_META[id].short. */
    short?: string;
    /** Full name for the tooltip and screen readers; defaults to PROCESS_META[id].label. */
    label?: string;
    /** Extra detail for the tooltip, e.g. the error message of a failed step. */
    detail?: string;
}

export interface StepsStripProps {
    steps: readonly Step[];
    size?: 'md' | 'lg';
    /** Accessible name of the list. */
    label?: string;
    className?: string;
}

/**
 * One square per process, so a failed mask shows red (or a half-done clean
 * amber) beside the green title instead of the whole item reading DONE.
 * Each square's tooltip and hidden text name the process and its state.
 */
export function StepsStrip({ steps, size = 'md', label, className }: StepsStripProps) {
    return (
        <ul className={cx('ui-steps', size === 'lg' && 'ui-steps--lg', className)} aria-label={label ?? tr('Process steps')}>
            {steps.map(step => {
                const meta = PROCESS_META[step.id as ProcessId];
                const name = step.label ?? (meta ? tr(meta.label) : String(step.id));
                const short = step.short ?? meta?.short ?? String(step.id).slice(0, 2);
                const text = `${name}: ${itemStateLabel(step.state)}${step.detail ? ` · ${step.detail}` : ''}`;
                return (
                    <li key={step.id} className="ui-step" data-state={step.state} title={text}>
                        <span aria-hidden="true">{short}</span>
                        <span className="ui-sr-only">{text}</span>
                    </li>
                );
            })}
        </ul>
    );
}
