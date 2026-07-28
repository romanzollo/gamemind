/**
 * Компактный индикатор ожидания для кнопок и text-actions.
 *
 * Зачем отдельный примитив: одно место для Scoreboard-стиля (currentColor,
 * без glow/purple) и `motion-safe` — при prefers-reduced-motion кольцо статично.
 * Обычно внутри SubmitButton; можно в обычной Button при isPending.
 */

type PendingSpinnerProps = {
    className?: string;
};

export function PendingSpinner({ className = '' }: PendingSpinnerProps) {
    return (
        <span
            className={`inline-block size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin ${className}`.trim()}
            aria-hidden
        />
    );
}
