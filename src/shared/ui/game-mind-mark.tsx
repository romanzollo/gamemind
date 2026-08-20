/**
 * Промежуточный знак шапки: GM + primary-полоска, без charcoal-плитки.
 *
 * На светлом surface тёмный rounded-rect даёт серую «бахрому» (антиалиасинг
 * + CSS ring не совпадает с SVG rx). Буквы наследуют currentColor ссылки.
 * Вкладка по-прежнему app-icon в src/app/icon.svg.
 */
type GameMindMarkProps = {
    className?: string;
};

export function GameMindMark({ className = '' }: GameMindMarkProps) {
    return (
        <svg
            viewBox="0 0 32 32"
            className={`block ${className}`.trim()}
            aria-hidden
        >
            <rect x="0" y="5" width="3.2" height="22" rx="0.8" className="fill-primary" />
            <path
                fill="currentColor"
                d="M17.7 7.6H12.3A5 5 0 0 0 7.3 12.6v6.8a5 5 0 0 0 5 5h5.4v-2.9h-5.4a2.1 2.1 0 0 1-2.1-2.1v-6.8a2.1 2.1 0 0 1 2.1-2.1h5.4V7.6Z"
            />
            <rect
                x="13.1"
                y="14.65"
                width="5.4"
                height="2.7"
                fill="currentColor"
            />
            <path
                fill="currentColor"
                d="M19.5 7.6h2.4l2.55 8.1 2.55-8.1H29.4v16.8h-2.3V14.3L24.45 22l-2.65-7.7v10H19.5V7.6Z"
            />
        </svg>
    );
}
