import { cx, itemStateLabel, type ItemState } from './types';

export interface StatusPillProps {
    state: ItemState;
    /** Overrides the default label ("To review", "Saved"...); already translated. */
    label?: string;
    className?: string;
}

/**
 * One item's state in a word. The colour repeats the word, it never replaces
 * it: queued and skipped are dashed, running pulses, and every label is text.
 */
export function StatusPill({ state, label, className }: StatusPillProps) {
    return (
        <span className={cx('ui-pill', className)} data-state={state}>
            {label ?? itemStateLabel(state)}
        </span>
    );
}
