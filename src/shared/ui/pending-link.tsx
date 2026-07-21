'use client';

import Link from 'next/link';
import { useLinkStatus } from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type PendingLinkProps = ComponentProps<typeof Link> & {
    children: ReactNode;
};

function PendingOpacity({ children }: { children: ReactNode }) {
    const { pending } = useLinkStatus();

    return (
        <span className={pending ? 'opacity-60' : undefined}>{children}</span>
    );
}

/**
 * Nav Link: лёгкий pending через opacity (без точки/ширины — иначе сдвиг шапки).
 * Next.js useLinkStatus.
 */
export function PendingLink({
    children,
    className = '',
    ...props
}: PendingLinkProps) {
    return (
        <Link
            {...props}
            className={`${className} inline-flex cursor-pointer items-center`.trim()}
        >
            <PendingOpacity>{children}</PendingOpacity>
        </Link>
    );
}
