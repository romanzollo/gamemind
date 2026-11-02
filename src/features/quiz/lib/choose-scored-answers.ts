/**
 * Какие ответы считать при сдаче партии.
 *
 * Есть зафиксированные по одному ответы (`/api/quiz/:id/answer`) — только
 * они: игрок уже видел правильный вариант, и ответ из формы мог бы его
 * «исправить». Нет ни одного — старая форма со всеми ответами (страница
 * открыта до перехода на lock-in): такой игрок правильных ответов не видел.
 *
 * Canon: docs/DECISIONS.md → Answer lock-in.
 */

type ScoredAnswer = { questionId: string; selectedOptionId: string };

export function chooseScoredAnswers(
    questions: ReadonlyArray<{ id: string }>,
    locked: ReadonlyArray<ScoredAnswer>,
    readFormAnswers: () => ScoredAnswer[],
): { source: 'locked' | 'form'; answers: ScoredAnswer[] } {
    if (locked.length === 0) {
        return { source: 'form', answers: readFormAnswers() };
    }

    return {
        source: 'locked',
        // Порядок и полнота — по вопросам сессии; без ответа — пустая строка,
        // как у формы (Classic вернёт ANSWER_ALL, Блиц по таймеру — partial).
        answers: questions.map((question) => ({
            questionId: question.id,
            selectedOptionId:
                locked.find((answer) => answer.questionId === question.id)
                    ?.selectedOptionId ?? '',
        })),
    };
}
