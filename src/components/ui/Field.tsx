import React, { createContext, useContext, useId } from 'react';
import { cx } from './types';

interface FieldContextValue {
    id: string;
    describedBy?: string;
    invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldProps {
    label: React.ReactNode;
    /** Right-hand side of the label row: a counter, a status, a unit. */
    aside?: React.ReactNode;
    asideTone?: 'ok' | 'warn' | 'bad';
    hint?: React.ReactNode;
    error?: React.ReactNode;
    /** Explicit id for the control; generated otherwise. */
    id?: string;
    /**
     * The content is not one form control (chips, a preview): the label
     * names a role="group" instead of pointing at a control with htmlFor.
     */
    group?: boolean;
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}

/**
 * Label + control + hint/error. The control (Input, Textarea or Select)
 * picks up its id, aria-describedby and aria-invalid from the field, so the
 * wiring cannot be forgotten at a call site.
 */
export function Field({ label, aside, asideTone, hint, error, id, group = false, className, style, children }: FieldProps) {
    const auto = useId();
    const controlId = id ?? `ui-f-${auto}`;
    const hintId = hint ? `${controlId}-hint` : undefined;
    const errorId = error ? `${controlId}-err` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
    return (
        <FieldContext.Provider value={{ id: controlId, describedBy, invalid: !!error }}>
            <div className={cx('ui-field', className)} style={style}
                role={group ? 'group' : undefined}
                aria-labelledby={group ? `${controlId}-label` : undefined}
                aria-describedby={group ? describedBy : undefined}>
                {/* The aside (a counter, a Preview key) sits beside the label,
                    not inside it: a button inside a <label for> is invalid, and
                    the aside would become part of the control's name. */}
                <div className="ui-field__label">
                    {React.createElement(group ? 'span' : 'label', {
                        id: `${controlId}-label`,
                        htmlFor: group ? undefined : controlId,
                    }, label)}
                    {aside != null && (
                        <span className={cx('ui-field__aside', asideTone && `ui-field__aside--${asideTone}`)}>{aside}</span>
                    )}
                </div>
                {children}
                {hint && <span id={hintId} className="ui-field__hint">{hint}</span>}
                {error && <span id={errorId} className="ui-field__error" role="alert">{error}</span>}
            </div>
        </FieldContext.Provider>
    );
}

/** The id / describedby / invalid wiring a control takes from its Field. */
function useFieldControl(props: { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: React.AriaAttributes['aria-invalid'] }) {
    const field = useContext(FieldContext);
    return {
        id: props.id ?? field?.id,
        'aria-describedby': [props['aria-describedby'], field?.describedBy].filter(Boolean).join(' ') || undefined,
        'aria-invalid': props['aria-invalid'] ?? (field?.invalid ? true : undefined),
    };
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    /** Monospace face, for codes and HTML. */
    mono?: boolean;
    ref?: React.Ref<HTMLInputElement>;
}

export function Input({ className, mono, ref, ...rest }: InputProps) {
    const wiring = useFieldControl(rest);
    return <input {...rest} {...wiring} ref={ref} className={cx('ui-input', mono && 'ui-input--mono', className)} />;
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    mono?: boolean;
    ref?: React.Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, mono, ref, ...rest }: TextareaProps) {
    const wiring = useFieldControl(rest);
    return <textarea {...rest} {...wiring} ref={ref} className={cx('ui-input', mono && 'ui-input--mono', className)} />;
}

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
    /** Either options or children (<option> / <optgroup>). */
    options?: readonly (SelectOption | string)[];
    /** A leading empty option, e.g. "Choose a type…". */
    placeholder?: string;
    children?: React.ReactNode;
    ref?: React.Ref<HTMLSelectElement>;
}

export function Select({ className, options, placeholder, children, ref, ...rest }: SelectProps) {
    const wiring = useFieldControl(rest);
    return (
        <select {...rest} {...wiring} ref={ref} className={cx('ui-input', className)}>
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options?.map(o => {
                const opt = typeof o === 'string' ? { value: o, label: o } : o;
                return <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>;
            })}
            {children}
        </select>
    );
}
