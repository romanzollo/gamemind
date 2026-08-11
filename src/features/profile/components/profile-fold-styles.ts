/**
 * Общие классы складки профиля (Достижения / История / Настройки).
 * Одна «меню-лента» на mobile — одинаковый hit-area и chevron.
 */

export const profileFoldSummaryClassName =
    'cursor-pointer list-none py-1 font-display text-xl font-semibold tracking-tight text-foreground marker:content-none sm:text-2xl [&::-webkit-details-marker]:hidden';

export const profileFoldChevronClassName =
    'font-mono text-sm font-normal text-muted transition-transform group-open:rotate-90';

export const profileFoldHeadingClassName =
    'font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl';

/** Mobile-ряд в единой ленте; на lg — обычная секция без divider. */
export const profileFoldRowClassName =
    'border-b border-border py-4 lg:border-b-0 lg:py-0';
