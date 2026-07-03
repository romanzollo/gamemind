// Репозиторий для работы с вопросами в БД

import { randomUUID } from 'node:crypto';

import type { ContentLocale } from '@prisma/client';
import type { Client } from 'pg';
import { defaultLocale, type Locale } from '@/shared/i18n';
import type {
    CreateQuestionInput,
    UpdateQuestionInput,
} from '@/features/admin/lib/validation';
import type { Difficulty } from '@/types';
import { prisma, withDatabaseRetry } from '@/lib/prisma';
import {
    isTransientDirectPgError,
    withDirectPgClient,
    withDirectPgWriteRetry,
} from '@/lib/db/direct-pg';
import { shuffleArray } from '@/shared/utils';

// кандидат для snapshot: id вопроса + id вариантов
export type QuestionSnapshotCandidate = {
    id: string;
    options: Array<{ id: string }>;
};

export type QuestionSnapshotDisplayText = {
    questionId: string;
    displayText: string;
    options: Map<string, string>;
};

type QuestionSnapshotCandidateRow = {
    question_id: string;
    option_id: string | null;
};

type TranslationRow = {
    locale: ContentLocale;
    text: string;
};

// перевод текста вопроса или варианта ответа
function pickTranslationText(
    translations: TranslationRow[],
    locale: Locale,
    legacyText?: string,
): string {
    const preferred = translations.find((row) => row.locale === locale)?.text;
    if (preferred) {
        return preferred;
    }

    const fallback = translations.find(
        (row) => row.locale === defaultLocale,
    )?.text;
    if (fallback) {
        return fallback;
    }

    if (legacyText) {
        return legacyText;
    }

    return translations[0]?.text ?? '';
}

export type LocalizedAdminText = {
    ru: { text: string };
    en: { text: string };
};

export type AdminQuestionForEdit = {
    id: string;
    difficulty: Difficulty;
    category: string;
    isActive: boolean;
    translations: LocalizedAdminText;
    options: Array<{
        id: string;
        isCorrect: boolean;
        order: number;
        translations: LocalizedAdminText;
    }>;
};

function buildAdminTranslations(
    translations: TranslationRow[],
    legacyText: string,
): LocalizedAdminText {
    return {
        ru: {
            text:
                translations.find((row) => row.locale === 'ru')?.text ??
                legacyText,
        },
        en: {
            text: translations.find((row) => row.locale === 'en')?.text ?? '',
        },
    };
}

function groupOptionTranslationsByOptionId(
    rows: Array<{
        optionId: string;
        locale: ContentLocale;
        text: string;
    }>,
) {
    const grouped = new Map<string, TranslationRow[]>();

    for (const row of rows) {
        const existing = grouped.get(row.optionId);

        if (existing) {
            existing.push({ locale: row.locale, text: row.text });
        } else {
            grouped.set(row.optionId, [
                { locale: row.locale, text: row.text },
            ]);
        }
    }

    return grouped;
}

function buildValuesPlaceholder(
    rowCount: number,
    columnCount: number,
    startIndex = 1,
) {
    return Array.from({ length: rowCount }, (_, rowIndex) => {
        const columns = Array.from({ length: columnCount }, (_, columnIndex) => {
            return `$${startIndex + rowIndex * columnCount + columnIndex}`;
        });

        return `(${columns.join(', ')})`;
    }).join(', ');
}

function adminQuestionMatchesUpdateInput(
    question: AdminQuestionForEdit,
    input: UpdateQuestionInput,
) {
    if (
        question.difficulty !== input.difficulty ||
        question.category !== input.category ||
        question.translations.ru.text !== input.translations.ru.text ||
        question.translations.en.text !== input.translations.en.text ||
        question.options.length !== input.options.length
    ) {
        return false;
    }

    for (const inputOption of input.options) {
        const currentOption = question.options.find(
            (option) => option.id === inputOption.id,
        );

        if (!currentOption) {
            return false;
        }

        if (
            currentOption.isCorrect !== inputOption.isCorrect ||
            currentOption.order !== inputOption.order ||
            currentOption.translations.ru.text !==
                inputOption.translations.ru.text ||
            currentOption.translations.en.text !==
                inputOption.translations.en.text
        ) {
            return false;
        }
    }

    return true;
}

async function findByIdForAdminWithDirectPg(
    id: string,
): Promise<AdminQuestionForEdit | null> {
    return withDirectPgClient(async (client) => {
        const questionResult = await client.query<{
            id: string;
            text: string;
            difficulty: Difficulty;
            category: string;
            isActive: boolean;
        }>(
            `
                SELECT
                    "id",
                    "text",
                    "difficulty"::text AS "difficulty",
                    "category",
                    "isActive"
                FROM "Question"
                WHERE "id" = $1
            `,
            [id],
        );

        const row = questionResult.rows[0];

        if (!row) {
            return null;
        }

        const optionsResult = await client.query<{
            id: string;
            text: string;
            isCorrect: boolean;
            order: number;
        }>(
            `
                SELECT "id", "text", "isCorrect", "order"
                FROM "AnswerOption"
                WHERE "questionId" = $1
                ORDER BY "order" ASC
            `,
            [id],
        );

        const questionTranslationsResult = await client.query<TranslationRow>(
            `
                SELECT "locale"::text AS "locale", "text"
                FROM "QuestionTranslation"
                WHERE "questionId" = $1
            `,
            [id],
        );

        const optionIds = optionsResult.rows.map((option) => option.id);
        const optionTranslationRows =
            optionIds.length === 0
                ? []
                : (
                      await client.query<{
                          optionId: string;
                          locale: ContentLocale;
                          text: string;
                      }>(
                          `
                              SELECT
                                  "optionId",
                                  "locale"::text AS "locale",
                                  "text"
                              FROM "AnswerOptionTranslation"
                              WHERE "optionId" = ANY($1::text[])
                          `,
                          [optionIds],
                      )
                  ).rows;

        const optionTranslationsByOptionId =
            groupOptionTranslationsByOptionId(optionTranslationRows);

        return {
            id: row.id,
            difficulty: row.difficulty,
            category: row.category,
            isActive: row.isActive,
            translations: buildAdminTranslations(
                questionTranslationsResult.rows,
                row.text,
            ),
            options: optionsResult.rows.map((option) => ({
                id: option.id,
                isCorrect: option.isCorrect,
                order: option.order,
                translations: buildAdminTranslations(
                    optionTranslationsByOptionId.get(option.id) ?? [],
                    option.text,
                ),
            })),
        };
    });
}

async function recoverAdminUpdateAfterWriteError(
    input: UpdateQuestionInput,
    error: unknown,
): Promise<{ id: string } | null> {
    if (!isTransientDirectPgError(error)) {
        return null;
    }

    const current = await findByIdForAdminWithDirectPg(input.questionId).catch(
        () => null,
    );

    if (!current || !adminQuestionMatchesUpdateInput(current, input)) {
        return null;
    }

    return { id: input.questionId };
}

async function applyAdminQuestionUpdateWithPg(
    client: Client,
    input: UpdateQuestionInput,
): Promise<{ id: string } | null> {
    const questionTranslationRows = [
        {
            id: randomUUID(),
            questionId: input.questionId,
            locale: 'ru' as const,
            text: input.translations.ru.text,
        },
        {
            id: randomUUID(),
            questionId: input.questionId,
            locale: 'en' as const,
            text: input.translations.en.text,
        },
    ];
    const optionRows = input.options.map((option) => ({
        id: option.id,
        text: option.translations.ru.text,
        isCorrect: option.isCorrect,
        order: option.order,
    }));
    const optionTranslationRows = input.options.flatMap((option) => [
        {
            id: randomUUID(),
            optionId: option.id,
            locale: 'ru' as const,
            text: option.translations.ru.text,
        },
        {
            id: randomUUID(),
            optionId: option.id,
            locale: 'en' as const,
            text: option.translations.en.text,
        },
    ]);

    const questionParams = [
        input.translations.ru.text,
        input.difficulty,
        input.category,
        input.questionId,
    ];
    const questionTranslationParams = questionTranslationRows.flatMap((row) => [
        row.id,
        row.questionId,
        row.locale,
        row.text,
    ]);
    const optionParams = optionRows.flatMap((row) => [
        row.id,
        row.text,
        row.isCorrect,
        row.order,
    ]);
    const optionTranslationParams = optionTranslationRows.flatMap((row) => [
        row.id,
        row.optionId,
        row.locale,
        row.text,
    ]);
    const allParams = [
        ...questionParams,
        ...questionTranslationParams,
        ...optionParams,
        ...optionTranslationParams,
    ];

    const questionTranslationStart = questionParams.length + 1;
    const optionStart =
        questionTranslationStart + questionTranslationParams.length;
    const optionTranslationStart = optionStart + optionParams.length;

    const result = await client.query<{
        question_count: number;
        option_count: number;
        question_translation_count: number;
        option_translation_count: number;
    }>(
        `
            WITH updated_question AS (
                UPDATE "Question"
                SET
                    "text" = $1,
                    "difficulty" = $2::"Difficulty",
                    "category" = $3,
                    "updatedAt" = NOW()
                WHERE "id" = $4
                RETURNING "id"
            ),
            question_translation_input("id", "questionId", "locale", "text") AS (
                VALUES ${buildValuesPlaceholder(
                    questionTranslationRows.length,
                    4,
                    questionTranslationStart,
                )}
            ),
            upsert_question_translations AS (
                INSERT INTO "QuestionTranslation" (
                    "id",
                    "questionId",
                    "locale",
                    "text"
                )
                SELECT
                    qti."id",
                    qti."questionId",
                    qti."locale"::"ContentLocale",
                    qti."text"
                FROM question_translation_input qti
                INNER JOIN updated_question uq
                    ON uq."id" = qti."questionId"
                ON CONFLICT ("questionId", "locale")
                DO UPDATE SET "text" = EXCLUDED."text"
                RETURNING "id"
            ),
            option_input("id", "text", "isCorrect", "order") AS (
                VALUES ${buildValuesPlaceholder(
                    optionRows.length,
                    4,
                    optionStart,
                )}
            ),
            updated_options AS (
                UPDATE "AnswerOption" ao
                SET
                    "text" = oi."text",
                    "isCorrect" = oi."isCorrect"::boolean,
                    "order" = oi."order"::int
                FROM option_input oi, updated_question uq
                WHERE
                    ao."id" = oi."id"
                    AND ao."questionId" = uq."id"
                RETURNING ao."id"
            ),
            option_translation_input("id", "optionId", "locale", "text") AS (
                VALUES ${buildValuesPlaceholder(
                    optionTranslationRows.length,
                    4,
                    optionTranslationStart,
                )}
            ),
            upsert_option_translations AS (
                INSERT INTO "AnswerOptionTranslation" (
                    "id",
                    "optionId",
                    "locale",
                    "text"
                )
                SELECT
                    oti."id",
                    oti."optionId",
                    oti."locale"::"ContentLocale",
                    oti."text"
                FROM option_translation_input oti
                INNER JOIN updated_options uo
                    ON uo."id" = oti."optionId"
                ON CONFLICT ("optionId", "locale")
                DO UPDATE SET "text" = EXCLUDED."text"
                RETURNING "id"
            )
            SELECT
                (SELECT COUNT(*)::int FROM updated_question) AS "question_count",
                (SELECT COUNT(*)::int FROM updated_options) AS "option_count",
                (
                    SELECT COUNT(*)::int
                    FROM upsert_question_translations
                ) AS "question_translation_count",
                (
                    SELECT COUNT(*)::int
                    FROM upsert_option_translations
                ) AS "option_translation_count"
        `,
        allParams,
    );

    const summary = result.rows[0];

    if (!summary || summary.question_count === 0) {
        return null;
    }

    if (
        summary.option_count !== input.options.length ||
        summary.question_translation_count !== questionTranslationRows.length ||
        summary.option_translation_count !== optionTranslationRows.length
    ) {
        throw new Error(
            `Incomplete question update for ${input.questionId}: ` +
                `${summary.option_count}/${input.options.length} options, ` +
                `${summary.question_translation_count}/${questionTranslationRows.length} question translations, ` +
                `${summary.option_translation_count}/${optionTranslationRows.length} option translations`,
        );
    }

    return { id: input.questionId };
}

async function updateWithOptionsWithDirectPg(
    input: UpdateQuestionInput,
): Promise<{ id: string } | null> {
    try {
        return await withDirectPgWriteRetry(
            (client) => applyAdminQuestionUpdateWithPg(client, input),
            2,
        );
    } catch (error) {
        const recovered = await recoverAdminUpdateAfterWriteError(
            input,
            error,
        );

        if (recovered) {
            return recovered;
        }

        throw error;
    }
}

// публичный вопрос для API (без переводов)
type PublicQuestionRow = {
    id: string;
    text: string;
    difficulty: Difficulty;
    translations: TranslationRow[];
    options: Array<{
        id: string;
        text: string;
        order: number;
        translations: TranslationRow[];
    }>;
};

function mapPublicQuestion(row: PublicQuestionRow, locale: Locale) {
    return {
        id: row.id,
        text: pickTranslationText(row.translations, locale, row.text),
        difficulty: row.difficulty,
        options: row.options.map((option) => ({
            id: option.id,
            text: pickTranslationText(option.translations, locale, option.text),
            order: option.order,
        })),
    };
}

// загрузка кандидатов для snapshot сессии по сложности
async function loadSnapshotCandidatesByDifficulty(
    difficulty: Difficulty,
): Promise<QuestionSnapshotCandidate[]> {
    const result = await withDirectPgClient((client) => {
        return client.query<QuestionSnapshotCandidateRow>(
            `
                SELECT
                    q."id" AS "question_id",
                    ao."id" AS "option_id"
                FROM "Question" q
                LEFT JOIN "AnswerOption" ao
                    ON ao."questionId" = q."id"
                WHERE
                    q."difficulty" = $1::"Difficulty"
                    AND q."isActive" = true
                ORDER BY q."createdAt" ASC, ao."order" ASC
            `,
            [difficulty],
        );
    });

    // группируем вопросы и варианты ответа
    const questions = new Map<string, QuestionSnapshotCandidate>();

    for (const row of result.rows) {
        const existing = questions.get(row.question_id);

        if (existing) {
            if (row.option_id) {
                existing.options.push({ id: row.option_id });
            }
        } else {
            questions.set(row.question_id, {
                id: row.question_id,
                options: row.option_id ? [{ id: row.option_id }] : [],
            });
        }
    }

    return Array.from(questions.values());
}

// репозиторий для работы с вопросами
export const questionRepository = {
    // поиск активных вопросов по сложности
    findActiveByDifficulty(difficulty: Difficulty, limit: number) {
        return withDatabaseRetry(() =>
            prisma.question.findMany({
                where: { difficulty, isActive: true },
                include: { options: { orderBy: { order: 'asc' } } },
                take: limit,
            }),
        );
    },

    // подсчет активных вопросов по сложности
    countActiveByDifficulty(difficulty: Difficulty) {
        return withDatabaseRetry(() =>
            prisma.question.count({
                where: { difficulty, isActive: true },
            }),
        );
    },

    // случайный выбор активных вопросов для snapshot сессии
    async pickRandomActiveForSnapshot(
        difficulty: Difficulty,
        limit: number,
    ): Promise<QuestionSnapshotCandidate[]> {
        const questions = await loadSnapshotCandidatesByDifficulty(difficulty);

        // перемешиваем вопросы
        const shuffled = shuffleArray(questions);

        // возвращаем случайные вопросы
        return shuffled.slice(0, limit).map((question) => {
            if (question.options.length === 0) {
                throw new Error(
                    `Question ${question.id} has no answer options`,
                );
            }

            return {
                id: question.id,
                options: question.options,
            };
        });
    },

    // resolved display text для snapshot сессии (locale + fallback ru + legacy text)
    async findSnapshotDisplayTextsByCandidates(
        locale: Locale,
        candidates: QuestionSnapshotCandidate[],
    ): Promise<Map<string, QuestionSnapshotDisplayText>> {
        if (candidates.length === 0) {
            return new Map();
        }

        const questionIds = candidates.map((candidate) => candidate.id);

        const rows = await withDatabaseRetry(() =>
            prisma.question.findMany({
                where: { id: { in: questionIds } },
                select: {
                    id: true,
                    text: true,
                    translations: {
                        select: {
                            locale: true,
                            text: true,
                        },
                    },
                    options: {
                        select: {
                            id: true,
                            text: true,
                            translations: {
                                select: {
                                    locale: true,
                                    text: true,
                                },
                            },
                        },
                    },
                },
            }),
        );

        const displayTexts = new Map<string, QuestionSnapshotDisplayText>();

        for (const row of rows) {
            const optionTexts = new Map<string, string>();

            for (const option of row.options) {
                optionTexts.set(
                    option.id,
                    pickTranslationText(
                        option.translations,
                        locale,
                        option.text,
                    ),
                );
            }

            displayTexts.set(row.id, {
                questionId: row.id,
                displayText: pickTranslationText(
                    row.translations,
                    locale,
                    row.text,
                ),
                options: optionTexts,
            });
        }

        return displayTexts;
    },

    // поиск активных публичных вопросов по сложности
    async findActivePublicByDifficulty(
        locale: Locale,
        difficulty: Difficulty,
        limit: number,
    ) {
        const rows = await withDatabaseRetry(() =>
            prisma.question.findMany({
                where: { difficulty, isActive: true },
                orderBy: { createdAt: 'asc' },
                take: limit,
                select: {
                    id: true,
                    text: true,
                    difficulty: true,
                    translations: {
                        select: {
                            locale: true,
                            text: true,
                        },
                    },
                    options: {
                        orderBy: { order: 'asc' },
                        select: {
                            id: true,
                            text: true,
                            order: true,
                            translations: {
                                select: {
                                    locale: true,
                                    text: true,
                                },
                            },
                        },
                    },
                },
            }),
        );

        return rows.map((row) => mapPublicQuestion(row, locale));
    },

    // поиск активных вопросов для scoring
    findActiveForScoring(difficulty: Difficulty, limit: number) {
        return withDatabaseRetry(() =>
            prisma.question.findMany({
                where: { difficulty, isActive: true },
                orderBy: { createdAt: 'asc' },
                take: limit,
                include: {
                    options: {
                        orderBy: { order: 'asc' }, // страница квиза уже использует такой же порядок в findActivePublicByDifficulty
                    },
                },
            }),
        );
    },

    // список вопросов для админ-панели
    async findAllForAdmin(locale: Locale) {
        const result = await withDirectPgClient((client) =>
            client.query<{
                id: string;
                text: string;
                difficulty: Difficulty;
                category: string;
                isActive: boolean;
                createdAt: Date;
                optionsCount: number;
            }>(
                `
                    SELECT
                        q."id",
                        COALESCE(active_translation."text", default_translation."text", q."text") AS "text",
                        q."difficulty"::text AS "difficulty",
                        q."category",
                        q."isActive",
                        q."createdAt",
                        COALESCE(option_counts."optionsCount", 0)::int AS "optionsCount"
                    FROM "Question" q
                    LEFT JOIN "QuestionTranslation" active_translation
                        ON active_translation."questionId" = q."id"
                        AND active_translation."locale" = $1::"ContentLocale"
                    LEFT JOIN "QuestionTranslation" default_translation
                        ON default_translation."questionId" = q."id"
                        AND default_translation."locale" = $2::"ContentLocale"
                    LEFT JOIN (
                        SELECT
                            "questionId",
                            COUNT(*)::int AS "optionsCount"
                        FROM "AnswerOption"
                        GROUP BY "questionId"
                    ) option_counts
                        ON option_counts."questionId" = q."id"
                    ORDER BY q."createdAt" DESC
                `,
                [locale, defaultLocale],
            ),
        );

        return result.rows.map((row) => ({
            id: row.id,
            text: row.text,
            difficulty: row.difficulty,
            category: row.category,
            isActive: row.isActive,
            createdAt: row.createdAt,
            _count: {
                options: row.optionsCount,
            },
        }));
    },

    // один вопрос для страницы редактирования (admin edit flow)
    findByIdForAdmin(id: string): Promise<AdminQuestionForEdit | null> {
        return findByIdForAdminWithDirectPg(id);
    },

    // создание вопроса с вариантами ответа (admin create flow)
    createWithOptions(input: CreateQuestionInput) {
        const ruQuestionText = input.translations.ru.text;

        return withDatabaseRetry(() =>
            prisma.question.create({
                data: {
                    text: ruQuestionText,
                    difficulty: input.difficulty,
                    category: input.category,
                    isActive: true,
                    translations: {
                        create: [
                            {
                                locale: 'ru',
                                text: input.translations.ru.text,
                            },
                            {
                                locale: 'en',
                                text: input.translations.en.text,
                            },
                        ],
                    },
                    options: {
                        create: input.options.map((option) => ({
                            text: option.translations.ru.text,
                            isCorrect: option.isCorrect,
                            order: option.order,
                            translations: {
                                create: [
                                    {
                                        locale: 'ru',
                                        text: option.translations.ru.text,
                                    },
                                    {
                                        locale: 'en',
                                        text: option.translations.en.text,
                                    },
                                ],
                            },
                        })),
                    },
                },
                select: { id: true },
            }),
        );
    },

    // обновление вопроса и вариантов по id (admin edit flow)
    updateWithOptions(input: UpdateQuestionInput) {
        return updateWithOptionsWithDirectPg(input);
    },

    // деактивация вопроса по id (admin deactivate flow)
    deactivateById(id: string) {
        return withDatabaseRetry(() =>
            prisma.$transaction(async (tx) => {
                const question = await tx.question.findUnique({
                    where: { id },
                    select: { id: true, isActive: true },
                });

                if (!question) {
                    return { status: 'not_found' } as const;
                }

                if (!question.isActive) {
                    return { status: 'already_in_target_state' } as const;
                }

                await tx.question.update({
                    where: { id },
                    data: { isActive: false },
                    select: { id: true },
                });

                return { status: 'updated' } as const;
            }),
        );
    },

    // активация вопроса по id (admin activate flow)
    activateById(id: string) {
        return withDatabaseRetry(() =>
            prisma.$transaction(async (tx) => {
                const question = await tx.question.findUnique({
                    where: { id },
                    select: { id: true, isActive: true },
                });

                if (!question) {
                    return { status: 'not_found' } as const;
                }

                if (question.isActive) {
                    return { status: 'already_in_target_state' } as const;
                }

                await tx.question.update({
                    where: { id },
                    data: { isActive: true },
                    select: { id: true },
                });

                return { status: 'updated' } as const;
            }),
        );
    },

    // удаление вопроса по id (admin delete flow)
    deleteById(id: string) {
        return withDatabaseRetry(() =>
            prisma.question.delete({
                where: { id },
                select: { id: true },
            }),
        );
    },
};
