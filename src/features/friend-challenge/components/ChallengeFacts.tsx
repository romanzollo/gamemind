/**
 * Правила вызова короткими строками со значками (страница вызова):
 * набор, «те же вопросы», «одна попытка». Server-safe.
 */

function ListIcon() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0">
            <path
                d="M6 4h7.5M6 8h7.5M6 12h7.5M2.5 4h.5M2.5 8h.5M2.5 12h.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
            />
        </svg>
    );
}

function ShuffleIcon() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0">
            <path
                d="M2 4.5h2.5c3 0 4 7 7 7H14M2 11.5h2.5c1.2 0 2-1 2.6-2.2M9 6.7c.6-1.2 1.4-2.2 2.5-2.2H14M12.5 3l1.5 1.5-1.5 1.5M12.5 10l1.5 1.5-1.5 1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function TargetIcon() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0">
            <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8" cy="8" r="2" fill="currentColor" />
        </svg>
    );
}

export function ChallengeFacts({
    setLine,
    sameQuestions,
    oneTry,
}: {
    setLine: string;
    sameQuestions: string;
    oneTry: string;
}) {
    const facts = [
        { key: 'set', icon: <ListIcon />, text: setLine, strong: true },
        { key: 'same', icon: <ShuffleIcon />, text: sameQuestions, strong: false },
        { key: 'one', icon: <TargetIcon />, text: oneTry, strong: false },
    ];

    return (
        <ul className="mt-4 divide-y divide-border border-t border-border">
            {facts.map((fact) => (
                <li
                    key={fact.key}
                    className={`flex items-center gap-2.5 py-2.5 text-sm ${
                        fact.strong ? 'font-semibold text-foreground' : 'text-foreground'
                    }`}
                >
                    <span className="text-primary">{fact.icon}</span>
                    {fact.text}
                </li>
            ))}
        </ul>
    );
}
