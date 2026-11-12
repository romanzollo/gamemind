/**
 * Знак GameMind в шапке — «сетка ответов»: три верных клетки и одна «мимо»,
 * как ✓/✗ в разборе, вызове и тексте «Поделиться».
 *
 * Без плитки: на светлой поверхности тёмный квадрат давал серую кайму
 * (антиалиасинг). Цвета — токены primary / danger, поэтому знак сам
 * переключается со светлой темой на тёмную.
 * Вкладка и иконки — тот же знак на тёмной плитке: src/app/icon.svg.
 * Canon: docs/DECISIONS.md → Brand mark: answer grid.
 */
type GameMindMarkProps = {
    className?: string;
};

const CELLS = [
    { x: 2, y: 2, tone: 'fill-primary' },
    { x: 17, y: 2, tone: 'fill-primary' },
    { x: 2, y: 17, tone: 'fill-primary' },
    { x: 17, y: 17, tone: 'fill-danger' },
] as const;

export function GameMindMark({ className = '' }: GameMindMarkProps) {
    return (
        <svg viewBox="0 0 32 32" className={`block ${className}`.trim()} aria-hidden>
            {CELLS.map((cell) => (
                <rect
                    key={`${cell.x}-${cell.y}`}
                    x={cell.x}
                    y={cell.y}
                    width="13"
                    height="13"
                    rx="3"
                    className={cell.tone}
                />
            ))}
        </svg>
    );
}
