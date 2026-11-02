/**
 * Какие ответы считать при сдаче партии.
 *
 * Есть зафиксированные по одному ответы (`/api/quiz/:id/answer`) — считаем
 * только их: игрок уже видел правильный вариант, и ответ из формы мог бы
 * его «исправить». Из зафиксированных — только засчитанные (`counted`):
 * у Survival это ответы, данные до конца банка (`replaySurvivalWave`).
 * Нет ни одного — старая форма со всеми ответами (страница открыта до
 * перехода на lock-in): такой игрок правильных ответов не видел.
 *
 * Canon: docs/DECISIONS.md → Answer lock-in; Survival on answer lock-in.
 */

type ScoredAnswer = { questionId: string; selectedOptionId: string };

export function chooseScoredAnswers(
    questions: ReadonlyArray<{ id: string }>,
    lock: {
        /** Все зафиксированные ответы сессии — решают, откуда брать ответы. */
        locked: ReadonlyArray<ScoredAnswer>;
        /** Засчитанные из них; по умолчанию — все. */
        counted?: ReadonlyArray<ScoredAnswer>;
    },
    readFormAnswers: () => ScoredAnswer[],
): { source: 'locked' | 'form'; answers: ScoredAnswer[] } {
    if (lock.locked.length === 0) {
        return { source: 'form', answers: readFormAnswers() };
    }

    const counted = lock.counted ?? lock.locked;

    return {
        source: 'locked',
        // Порядок и полнота — по вопросам сессии; без ответа — пустая строка,
        // как у формы (Classic вернёт ANSWER_ALL, Блиц по таймеру — partial).
        answers: questions.map((question) => ({
            questionId: question.id,
            selectedOptionId:
                counted.find((answer) => answer.questionId === question.id)
                    ?.selectedOptionId ?? '',
        })),
    };
}
