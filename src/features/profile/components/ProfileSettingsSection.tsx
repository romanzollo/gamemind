/**
 * Client-shell настроек профиля: `<details>` переживает RSC refresh.
 *
 * Без Client boundary после смены username/avatar/password Server Action +
 * revalidate пересобирает page.tsx и нативный `<details>` снова закрыт →
 * контент схлопывается и кажется, что страница «прыгнула» вверх.
 *
 * Mobile: тот же ряд меню-ленты, что Достижения / История.
 */
'use client';

import type { ReactNode } from 'react';

import {
    profileFoldChevronClassName,
    profileFoldRowClassName,
    profileFoldSummaryClassName,
} from '@/features/profile/components/profile-fold-styles';

type ProfileSettingsSectionProps = {
    title: string;
    children: ReactNode;
};

export function ProfileSettingsSection({
    title,
    children,
}: ProfileSettingsSectionProps) {
    return (
        <details
            className={[
                'group',
                profileFoldRowClassName,
                // Desktop: прежний отступ сверху, без «ленточного» border-b
                'lg:mt-10 lg:border-b-0 lg:border-t lg:border-border lg:pt-8',
            ].join(' ')}
        >
            <summary className={profileFoldSummaryClassName}>
                <span className="flex min-h-11 w-full items-center">
                    <span className="inline-flex items-center gap-2">
                        {title}
                        <span
                            className={profileFoldChevronClassName}
                            aria-hidden
                        >
                            ›
                        </span>
                    </span>
                </span>
            </summary>

            <div className="mt-4 space-y-8 lg:mt-6">{children}</div>
        </details>
    );
}
