/**
 * Промежуточный знак шапки: plaque + GM (концепт A).
 *
 * Зачем отдельный компонент, а не img из public:
 * - inline SVG без лишнего запроса на каждый layout;
 * - декоративный (название уже текстом в ссылке) — aria-hidden.
 *
 * Это не locked identity. Источник черновиков: docs/brand/.
 * Вкладка использует другой знак (src/app/icon.svg, chevrons) —
 * он лучше живёт на 16px. Заменить оба, когда будет осознанный логотип.
 */
type GameMindMarkProps = {
    className?: string;
};

export function GameMindMark({ className = '' }: GameMindMarkProps) {
    return (
        <svg
            viewBox="0 0 32 32"
            className={className}
            aria-hidden
        >
            <rect width="32" height="32" rx="5" fill="#14181f" />
            {/* Левая стойка скругления совпадает с rx plaque, без clipPath */}
            <path
                fill="#0b6e4f"
                d="M5 0v32A5 5 0 0 1 0 27V5A5 5 0 0 1 5 0Z"
            />
            <path
                fill="#f7fffb"
                d="M17.7 7.6H12.3A5 5 0 0 0 7.3 12.6v6.8a5 5 0 0 0 5 5h5.4v-2.9h-5.4a2.1 2.1 0 0 1-2.1-2.1v-6.8a2.1 2.1 0 0 1 2.1-2.1h5.4V7.6Z"
            />
            <rect x="13.1" y="14.65" width="5.4" height="2.7" fill="#f7fffb" />
            <path
                fill="#f7fffb"
                d="M19.5 7.6h2.4l2.55 8.1 2.55-8.1H29.4v16.8h-2.3V14.3L24.45 22l-2.65-7.7v10H19.5V7.6Z"
            />
        </svg>
    );
}
