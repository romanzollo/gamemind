/**
 * Client-shell настроек профиля: `<details>` переживает RSC refresh.
 *
 * Без Client boundary после смены username/avatar/password Server Action +
 * revalidate пересобирает page.tsx и нативный `<details>` снова закрыт →
 * контент схлопывается и кажется, что страница «прыгнула» вверх.
 *
 * Здесь island сохраняет DOM/React state (в т.ч. open) при soft refresh.
 */
'use client';

import type { ReactNode } from 'react';

type ProfileSettingsSectionProps = {
    title: string;
    children: ReactNode;
};

export function ProfileSettingsSection({
    title,
    children,
}: ProfileSettingsSectionProps) {
    return (
        <details className="group mt-8 border-t border-border pt-6 sm:mt-10 sm:pt-8">
            <summary className="cursor-pointer list-none font-display text-xl font-semibold tracking-tight text-foreground marker:content-none sm:text-2xl [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                    {title}
                    <span
                        className="font-mono text-sm font-normal text-muted transition-transform group-open:rotate-90"
                        aria-hidden
                    >
                        ›
                    </span>
                </span>
            </summary>

            <div className="mt-6 space-y-8">{children}</div>
        </details>
    );
}
