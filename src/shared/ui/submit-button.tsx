'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { buttonClassName, type ButtonVariant } from './button';
import { PendingSpinner } from './pending-spinner';

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
 * Disables the control, sets aria-busy, and shows a spinner while pending.
 *
 * Visual pending = spinner + (pendingLabel ?? children), не только opacity:
 * text-link actions в admin иначе почти незаметны во время Neon wait.
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
    // Лёгкое затемнение + cursor-wait; главный сигнал — spinner (см. выше).
    const pendingClassName = pending
        ? 'inline-flex cursor-wait items-center gap-1.5 opacity-80'
        : '';
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
            {pending ? (
                <>
                    <PendingSpinner />
                    <span>{pendingLabel ?? children}</span>
                </>
            ) : (
                children
            )}
        </button>
    );
}
