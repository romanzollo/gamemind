/**
 * Чистые helpers JSON snapshot QuizSession (v1 single text / v2 bilingual).
 *
 * Без SQL и без Prisma: только сборка, parse и маппинг frozen snapshotData.
 * Пишет/читает репозиторий start/submit/reads. Scoring использует optionId +
 * isCorrect из этого же JSON — не трогать логику при §11.7 move.
 * См. docs/DECISIONS.md → Repository File Split + Neon Write Path For Quiz Snapshot.
 */

import type { Difficulty, QuestionType } from '@/types';
import { defaultLocale, type Locale } from '@/shared/i18n';
import type {
    LocalizedSnapshotTexts,
    QuestionSnapshotBundleItem,
} from '@/entities/question/question.types';
import type {
    CreateQuizSessionWithSnapshotInput,
    SessionSnapshotPublicQuestion,
    SessionSnapshotScoringQuestion,
} from '@/entities/quiz-session/quiz-session.types';
import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';

type SnapshotOptionData = {
    id: string;
    text?: string;
    texts?: LocalizedSnapshotTexts;
    order: number;
    isCorrect: boolean;
};

type SnapshotQuestionData = {
    id: string;
    text?: string;
    texts?: LocalizedSnapshotTexts;
    difficulty: Difficulty;
    type?: QuestionType;
    imageUrl?: string | null;
    position: number;
    options: SnapshotOptionData[];
};

/** Форма JSON в QuizSession.snapshotData (v1 = legacy text, v2 = texts.ru/en). */
export type QuizSessionSnapshotData = {
    version: 1 | 2;
    questions: SnapshotQuestionData[];
};

/** Инвариант create: у каждого вопроса/варианта есть хотя бы один непустой текст. */
export function assertSnapshotDisplayTexts(
    input: CreateQuizSessionWithSnapshotInput,
) {
    for (const question of input.questions) {
        if (
            !question.displayText.trim() &&
            !question.displayTexts.ru.trim() &&
            !question.displayTexts.en.trim()
        ) {
            throw new Error(
                `Missing displayText for question ${question.questionId}`,
            );
        }

        for (const option of question.options) {
            if (
                !option.displayText.trim() &&
                !option.displayTexts.ru.trim() &&
                !option.displayTexts.en.trim()
            ) {
                throw new Error(
                    `Missing displayText for option ${option.optionId}`,
                );
            }
        }
    }
}

/**
 * Выбор display-строки: locale → defaultLocale (ru) → другой язык → legacy text.
 * Используется и при записи snapshot, и при чтении UI/review.
 */
export function pickSnapshotText(
    texts: LocalizedSnapshotTexts | undefined,
    legacyText: string | undefined,
    locale: Locale,
): string {
    if (texts) {
        const preferred = texts[locale]?.trim();
        if (preferred) {
            return preferred;
        }

        const fallback = texts[defaultLocale]?.trim();
        if (fallback) {
            return fallback;
        }

        const other = locale === 'ru' ? texts.en : texts.ru;
        if (other?.trim()) {
            return other.trim();
        }
    }

    return legacyText?.trim() ?? '';
}

/** v2 со всеми texts на вопросах и вариантах — mid-session locale switch без DB overlay. */
export function hasBilingualTexts(snapshotData: QuizSessionSnapshotData) {
    return (
        snapshotData.version === 2 &&
        snapshotData.questions.every(
            (question) =>
                question.texts &&
                question.options.every((option) => option.texts),
        )
    );
}

/** Собирает frozen JSON v2 из shuffled input + picked bundle (isCorrect из pick). */
export function buildSnapshotData(
    input: CreateQuizSessionWithSnapshotInput,
    pickedQuestions: QuestionSnapshotBundleItem[],
): QuizSessionSnapshotData {
    const pickedById = new Map(
        pickedQuestions.map((question) => [question.id, question]),
    );

    return {
        version: 2,
        questions: input.questions.map((question) => {
            const picked = pickedById.get(question.questionId);

            if (!picked) {
                throw new Error(
                    `Missing picked question ${question.questionId}`,
                );
            }

            const pickedOptions = new Map(
                picked.options.map((option) => [option.id, option]),
            );

            const questionTexts = question.displayTexts ?? picked.displayTexts;

            return {
                id: question.questionId,
                text: pickSnapshotText(
                    questionTexts,
                    question.displayText,
                    input.sessionLocale,
                ),
                texts: questionTexts,
                difficulty: picked.difficulty,
                type: picked.type,
                imageUrl: normalizeQuizImageUrl(question.displayImageUrl),
                position: question.position,
                options: question.options.map((option) => {
                    const pickedOption = pickedOptions.get(option.optionId);

                    if (!pickedOption) {
                        throw new Error(
                            `Missing picked option ${option.optionId}`,
                        );
                    }

                    const optionTexts =
                        option.displayTexts ?? pickedOption.displayTexts;

                    return {
                        id: option.optionId,
                        text: pickSnapshotText(
                            optionTexts,
                            option.displayText,
                            input.sessionLocale,
                        ),
                        texts: optionTexts,
                        order: option.displayOrder,
                        isCorrect: pickedOption.isCorrect,
                    };
                }),
            };
        }),
    };
}

/** Безопасный parse jsonb / string из БД; битая форма → null (caller = invalid_snapshot). */
export function parseSnapshotData(
    value: QuizSessionSnapshotData | string | null,
): QuizSessionSnapshotData | null {
    if (!value) {
        return null;
    }

    const data = typeof value === 'string' ? JSON.parse(value) : value;

    if (
        typeof data !== 'object' ||
        data === null ||
        (data.version !== 1 && data.version !== 2) ||
        !Array.isArray(data.questions)
    ) {
        return null;
    }

    return data as QuizSessionSnapshotData;
}

/** Snapshot → UI DTO; порядок = position / displayOrder. */
export function mapSnapshotDataToPublicQuestions(
    snapshotData: QuizSessionSnapshotData,
    expectedQuestionCount: number,
    locale: Locale,
    options?: {
        /**
         * Survival play DTO: leak isCorrect для lock-in без per-question hop.
         * Classic / Blitz / Daily оставляют false — поле не попадает в JSON.
         */
        includeCorrectness?: boolean;
    },
): SessionSnapshotPublicQuestion[] | null {
    if (snapshotData.questions.length !== expectedQuestionCount) {
        return null;
    }

    const includeCorrectness = options?.includeCorrectness === true;

    return [...snapshotData.questions]
        .sort((left, right) => left.position - right.position)
        .map((question) => ({
            id: question.id,
            text: pickSnapshotText(question.texts, question.text, locale),
            difficulty: question.difficulty,
            type: question.type,
            imageUrl: normalizeQuizImageUrl(question.imageUrl),
            options: [...question.options]
                .sort((left, right) => left.order - right.order)
                .map((option) => ({
                    id: option.id,
                    text: pickSnapshotText(option.texts, option.text, locale),
                    order: option.order,
                    ...(includeCorrectness
                        ? { isCorrect: option.isCorrect }
                        : {}),
                })),
        }));
}

/** Snapshot → scoring DTO (id + difficulty + isCorrect); без текстов. */
export function mapSnapshotDataToScoringQuestions(
    snapshotData: QuizSessionSnapshotData,
    expectedQuestionCount: number,
): SessionSnapshotScoringQuestion[] | null {
    if (snapshotData.questions.length !== expectedQuestionCount) {
        return null;
    }

    return [...snapshotData.questions]
        .sort((left, right) => left.position - right.position)
        .map((question) => ({
            id: question.id,
            difficulty: question.difficulty,
            options: [...question.options]
                .sort((left, right) => left.order - right.order)
                .map((option) => ({
                    id: option.id,
                    isCorrect: option.isCorrect,
                })),
        }));
}
