import type { ReactNode } from 'react';

type EmptyStateProps = {
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
};

/** Neutral empty placeholder for lists/tables — not an error. */
export function EmptyState({
    title,
    description,
    action,
    className = '',
}: EmptyStateProps) {
    return (
        <div
            className={`rounded-lg border border-dashed border-border bg-surface-muted/60 px-4 py-8 text-center ${className}`.trim()}
            role="status"
        >
            <p className="text-sm font-medium text-foreground sm:text-base">
                {title}
            </p>
            {description ? (
                <p className="mt-2 text-sm leading-relaxed text-muted">
                    {description}
                </p>
            ) : null}
            {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
        </div>
    );
}
