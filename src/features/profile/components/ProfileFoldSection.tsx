/**
 * Client-shell сворачиваемой секции профиля (как Настройки).
 *
 * Mobile (&lt;lg): `<details>` закрыт по умолчанию — длинный список ачивок/истории
 * не раздувает первый экран.
 * Desktop (lg+): секция всегда раскрыта, summary скрыт — прежний 2-col layout.
 *
 * Island сохраняет open state при soft refresh (как ProfileSettingsSection).
 */
'use client';

import type { ReactNode } from 'react';

import {
    profileFoldChevronClassName,
    profileFoldHeadingClassName,
    profileFoldRowClassName,
    profileFoldSummaryClassName,
} from '@/features/profile/components/profile-fold-styles';

type ProfileFoldSectionProps = {
    title: string;
    titleId: string;
    /** Счётчик справа от заголовка (например 3 / 17). */
    trailing?: ReactNode;
    children: ReactNode;
    className?: string;
};

export function ProfileFoldSection({
    title,
    titleId,
    trailing,
    children,
    className = '',
}: ProfileFoldSectionProps) {
    const rowClass = [profileFoldRowClassName, className]
        .filter(Boolean)
        .join(' ');

    return (
        <>
            {/* Mobile: складка в общей меню-ленте */}
            <details className={['group lg:hidden', rowClass].join(' ')}>
                <summary className={profileFoldSummaryClassName}>
                    <span className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-2">
                            {title}
                            <span
                                className={profileFoldChevronClassName}
                                aria-hidden
                            >
                                ›
                            </span>
                        </span>
                        {trailing ? (
                            <span className="font-mono text-sm font-normal tabular-nums tracking-tight text-muted">
                                {trailing}
                            </span>
                        ) : null}
                    </span>
                </summary>
                <div className="pb-1 pt-2">{children}</div>
            </details>

            {/* Desktop: всегда открыто */}
            <section
                className={['hidden lg:block', className]
                    .filter(Boolean)
                    .join(' ')}
                aria-labelledby={titleId}
            >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h2 id={titleId} className={profileFoldHeadingClassName}>
                        {title}
                    </h2>
                    {trailing ? (
                        <p className="font-mono text-sm tabular-nums tracking-tight text-muted">
                            {trailing}
                        </p>
                    ) : null}
                </div>
                {children}
            </section>
        </>
    );
}
