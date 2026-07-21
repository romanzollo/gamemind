'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { buttonClassName, type ButtonVariant } from './button';

type SubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    variant?: ButtonVariant;
    /**
     * Skip design-system button styles (table text actions, etc.).
     * Prefer `variant` for normal CTAs.
     */
    unstyled?: boolean;
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
    variant = 'primary',
    unstyled = false,
    className = '',
    ...props
}: SubmitButtonProps) {
    const { pending } = useFormStatus();
    const isDisabled = Boolean(disabled) || pending;
    const pendingClassName = pending ? 'cursor-wait opacity-70' : '';
    // unstyled: всё равно pointer (глобальный base + явный класс);
    // pending → cursor-wait; disabled → not-allowed из globals / disabled:*.
    const resolvedClassName = unstyled
        ? `cursor-pointer ${className} ${pendingClassName}`.trim()
        : buttonClassName({
              variant,
              className: `${className} ${pendingClassName}`.trim(),
          });

    return (
        <button
            type="submit"
            disabled={isDisabled}
            aria-busy={pending}
            className={resolvedClassName}
            {...props}
        >
            {pending ? (pendingLabel ?? children) : children}
        </button>
    );
}
