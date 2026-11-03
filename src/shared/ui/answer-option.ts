/**
 * Вид варианта ответа и плашки «В точку! / Мимо» — один на настоящую игру
 * (QuizSessionForm) и демо-вопрос первого экрана, чтобы демо выглядело
 * ровно как игра. Только классы: состояние и логика — у вызывающего.
 */

export type AnswerOptionTone =
    | 'idle'
    /** Выбран, ждём сервер. */
    | 'pending'
    | 'correct'
    /** Выбран и неверен. */
    | 'wrong'
    /** Ответ уже есть, этот вариант не участвует. */
    | 'dimmed';

const toneClassName: Record<AnswerOptionTone, string> = {
    idle: 'border-border bg-surface hover:bg-surface-hover',
    pending: 'border-primary bg-primary/10',
    correct: 'border-success bg-success-muted',
    wrong: 'border-danger bg-danger-muted',
    dimmed: 'border-border bg-surface opacity-60',
};

export function answerOptionClassName(
    tone: AnswerOptionTone,
    locked: boolean,
): string {
    return [
        'flex min-h-14 w-full items-center rounded-lg border-2 px-4 py-3 text-left text-base font-medium text-foreground motion-safe:transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        locked ? 'cursor-default' : 'cursor-pointer',
        toneClassName[tone],
    ].join(' ');
}

export function answerVerdictClassName(isCorrect: boolean): {
    plate: string;
    title: string;
} {
    return {
        plate: [
            'rounded-lg border-l-4 px-3 py-2.5',
            isCorrect
                ? 'border-success bg-success-muted'
                : 'border-danger bg-danger-muted',
        ].join(' '),
        title: [
            'font-display text-lg font-semibold',
            isCorrect ? 'text-success' : 'text-danger',
        ].join(' '),
    };
}
