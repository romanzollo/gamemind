// типы для вопросов scoring
type ScoringQuestion = {
    id: string;
    options: Array<{
        id: string;
        isCorrect: boolean;
    }>;
};

// типы для ответов scoring
type ScoringAnswer = {
    questionId: string;
    selectedOptionId: string;
};

// функция для расчета результатов викторины
export function calculateQuizScore(
    questions: ScoringQuestion[],
    answers: ScoringAnswer[],
) {
    let correctCount = 0;

    for (const question of questions) {
        const answer = answers.find((item) => item.questionId === question.id);

        if (!answer) {
            continue;
        }

        const selectedOption = question.options.find(
            (option) => option.id === answer.selectedOptionId,
        );

        if (selectedOption?.isCorrect) {
            correctCount += 1;
        }
    }

    const totalQuestions = questions.length;

    return {
        correctCount,
        totalQuestions,
        score: correctCount,
    };
}
