import type { ReactNode } from 'react';

export type InlineAlertTone = 'danger' | 'success' | 'warning' | 'info';

type InlineAlertProps = {
    children: ReactNode;
    tone?: InlineAlertTone;
    className?: string;
    /** Defaults to `alert` for errors; use `status` for non-interruptive info. */
    role?: 'alert' | 'status';
};

const toneClassName: Record<InlineAlertTone, string> = {
    danger: 'bg-danger-muted text-danger',
    success: 'bg-success-muted text-success',
    warning: 'bg-warning-muted text-warning',
    info: 'bg-surface-muted text-foreground',
};

/** Compact inline banner for form/page feedback (errors, success, hints). */
export function InlineAlert({
    children,
    tone = 'danger',
    className = '',
    role = 'alert',
}: InlineAlertProps) {
    return (
        <p
            role={role}
            className={`rounded-md px-3 py-2 text-sm ${toneClassName[tone]} ${className}`.trim()}
        >
            {children}
        </p>
    );
}
