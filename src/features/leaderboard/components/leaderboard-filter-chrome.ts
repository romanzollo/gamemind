/**
 * Общий chrome segmented-фильтров рейтинга (Scoreboard Editorial).
 *
 * Четвёртый режим («Выживание») не влезает в один flex-ряд на 320px:
 * track на мобилке переносится, на sm+ снова одна линия. Текст чипа
 * `whitespace-nowrap` — режем ширину ряда, не буквы внутри кнопки.
 */

export const leaderboardFilterLabelClassName =
    'mb-2 text-xs font-medium uppercase tracking-wider text-muted';

export const leaderboardFilterChipClassName = [
    'min-h-10 min-w-0 justify-center whitespace-nowrap rounded-sm px-2 py-2',
    'text-center text-xs font-semibold tracking-normal',
    'motion-safe:transition-colors sm:min-h-11 sm:px-3 sm:text-sm sm:tracking-wide',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
].join(' ');

export function leaderboardFilterChipStateClassName(isActive: boolean): string {
    return isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted hover:bg-surface-hover hover:text-foreground';
}
