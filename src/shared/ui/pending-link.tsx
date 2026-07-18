'use client';

import Link from 'next/link';
import { useLinkStatus } from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type PendingLinkProps = ComponentProps<typeof Link> & {
    children: ReactNode;
};

function PendingCue() {
    const { pending } = useLinkStatus();

    if (!pending) {
        return null;
    }

    return (
        <span
            className="ml-1 inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current align-middle"
            aria-hidden
        />
    );
}

function PendingOpacity({ children }: { children: ReactNode }) {
    const { pending } = useLinkStatus();

    return (
        <span className={pending ? 'opacity-60' : undefined}>{children}</span>
    );
}

/** Nav Link that shows a pulse cue while soft-navigating (Next.js useLinkStatus). */
export function PendingLink({
    children,
    className = '',
    ...props
}: PendingLinkProps) {
    return (
        <Link
            {...props}
            className={`${className} inline-flex items-center`.trim()}
        >
            <PendingOpacity>{children}</PendingOpacity>
            <PendingCue />
        </Link>
    );
}
