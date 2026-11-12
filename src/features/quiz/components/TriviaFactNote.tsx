/**
 * Строка «А ты знал?»: метка с лампочкой и текст факта.
 *
 * - `sheet` — внутри плашки вердикта под тонкой линией; появляется мягко
 *   (motion-safe), потому что приходит на ~0,3 с позже вердикта. Вне
 *   `role="status"`: экранный диктор не зачитывает факт сам на каждом
 *   вопросе — его можно прочитать, как обычный текст.
 * - `review` — своя подложка в разборе.
 *
 * Источник факта игроку не показываем: он в данных для ревью и правок
 * (почти все источники англоязычные, а ссылка уводит из игры).
 * Цвет — токен `info` («нейтральная подсказка», DESIGN.md), чтобы факт не
 * путался с вердиктом. ADR: docs/DECISIONS.md → Did you know: trivia facts.
 */

type TriviaFactNoteProps = {
    label: string;
    text: string;
    variant: 'sheet' | 'review';
};

function BulbIcon() {
    return (
        <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M5.5 10.5c-1.2-.9-2-2.3-2-3.9a4.5 4.5 0 0 1 9 0c0 1.6-.8 3-2 3.9v1H5.5v-1Z" />
            <path d="M6 13.5h4" />
        </svg>
    );
}

export function TriviaFactNote({ label, text, variant }: TriviaFactNoteProps) {
    return (
        <div
            data-testid="quiz-fact"
            className={
                variant === 'sheet'
                    ? 'mt-2 border-t border-foreground/10 pt-2 motion-safe:animate-fact-in'
                    : 'mt-3 rounded-md bg-info-muted px-3 py-2'
            }
        >
            <p className="flex items-center gap-1.5 font-mono text-2xs font-medium uppercase tracking-[0.14em] text-info">
                <BulbIcon />
                {label}
            </p>
            <p className="mt-0.5 text-pretty text-sm leading-snug text-foreground">
                {text}
            </p>
        </div>
    );
}
