/**
 * Ряд меток «верно / мимо» по вопросам вызова (без текста вопросов).
 * Статус не только цветом: галочка или крестик (docs/DESIGN.md, правило 3).
 * Server-safe: без хуков, годится и для страницы вызова, и для результата.
 */

type ChallengeMarksProps = {
    marks: readonly boolean[];
    /** Подпись для скринридера, например «2/3». */
    label: string;
    size?: 'sm' | 'md';
};

function CheckIcon() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
            <path
                d="M3.5 8.5l3 3 6-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function CrossIcon() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
            <path
                d="M4.5 4.5l7 7M11.5 4.5l-7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

export function ChallengeMarks({ marks, label, size = 'md' }: ChallengeMarksProps) {
    const box = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';

    return (
        <span role="img" aria-label={label} className="inline-flex flex-wrap gap-1">
            {marks.map((isCorrect, index) => (
                <span
                    key={index}
                    className={`inline-flex ${box} items-center justify-center rounded-sm border ${
                        isCorrect
                            ? 'border-success/40 bg-success-muted text-success'
                            : 'border-danger/40 bg-danger-muted text-danger'
                    }`}
                >
                    {isCorrect ? <CheckIcon /> : <CrossIcon />}
                </span>
            ))}
        </span>
    );
}
