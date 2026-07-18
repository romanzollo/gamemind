'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

type SubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    /** Shown while the parent form Server Action is pending */
    pendingLabel?: ReactNode;
};

/**
 * Must be rendered inside a `<form>` that uses a Server Action.
 * Disables the control and sets aria-busy while pending.
 */
export function SubmitButton({
    children,
    pendingLabel,
    disabled,
    className = '',
    ...props
}: SubmitButtonProps) {
    const { pending } = useFormStatus();
    const isDisabled = Boolean(disabled) || pending;

    return (
        <button
            type="submit"
            disabled={isDisabled}
            aria-busy={pending}
            className={`${className} ${pending ? 'cursor-wait opacity-70' : ''}`.trim()}
            {...props}
        >
            {pending ? (pendingLabel ?? children) : children}
        </button>
    );
}
