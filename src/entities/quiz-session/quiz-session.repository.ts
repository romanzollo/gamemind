/**
 * QuizSession repository facade (§11.7).
 *
 * Стабильная точка импорта для features / pages:
 * типы, QuizSessionStartError, quizSessionRepository.
 * Реализация: types + snapshot helpers + start + submit + reads + answer lock-in.
 * См. docs/DECISIONS.md → Repository File Split.
 */

import { quizSessionAnswerMethods } from '@/entities/quiz-session/quiz-session-answer.repository';
import { quizSessionReadsMethods } from '@/entities/quiz-session/quiz-session-reads.repository';
import { quizSessionStartMethods } from '@/entities/quiz-session/quiz-session-start.repository';
import { quizSessionSubmitMethods } from '@/entities/quiz-session/quiz-session-submit.repository';
import { QuizSessionStartError } from '@/entities/quiz-session/quiz-session.types';

export type {
    CreateQuizSessionWithSnapshotInput,
    QuizSessionPublicView,
    QuizSessionSurvivalPlayView,
    SessionForSubmitResult,
    SessionReviewPayload,
    SessionSnapshotPublicQuestion,
    SessionSnapshotQuestionInput,
    SessionSnapshotScoringQuestion,
} from '@/entities/quiz-session/quiz-session.types';

export { QuizSessionStartError };

export const quizSessionRepository = {
    ...quizSessionStartMethods,
    ...quizSessionSubmitMethods,
    ...quizSessionReadsMethods,
    ...quizSessionAnswerMethods,
};
