/**
 * Агрегаты для админ-хаба (`/:locale/admin`).
 *
 * Одна лёгкая выборка COUNT без JOIN/переводов — чтобы hub оставался
 * быстрым и не повторял hang-класс списка вопросов (July 24 playbook).
 * Quiz snapshot / scoring / hot path старта квиза не затрагиваются.
 */
import { withDirectPgClient } from '@/lib/db/direct-pg';

/** Сводка чисел для карточек админ-хаба. Без секретов и без PII. */
export type AdminHomeCounts = {
    usersTotal: number;
    questionsActive: number;
    questionsInactive: number;
    /**
     * Все строки Question с type = IMAGE_GUESS (не фильтр isActive).
     * Инвариант: questionsText + questionsImage === questionsActive + questionsInactive.
     */
    questionsImage: number;
    /**
     * Все строки Question с type = TEXT (не фильтр isActive).
     * Считать по enum, не по наличию QuestionAsset.
     */
    questionsText: number;
    /** Сессии, у которых startedAt ≥ начало текущих суток UTC. */
    sessionsToday: number;
};

type AdminHomeCountsRow = {
    users_total: number;
    questions_active: number;
    questions_inactive: number;
    questions_image: number;
    questions_text: number;
    sessions_today: number;
};

/**
 * Начало календарных суток в UTC для «сегодня».
 * UTC выбран намеренно: один и тот же порог на любом сервере (Vercel/локаль).
 */
function startOfUtcDay(now = new Date()): Date {
    return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
}

/**
 * Читает агрегаты для админ-хаба одним round-trip.
 * Unpooled direct pg — тот же класс пути, что admin users / profile history.
 * Не использовать withAdminListPgClient: очередь списка вопросов — отдельный контракт.
 */
export async function findAdminHomeCounts(): Promise<AdminHomeCounts> {
    const dayStart = startOfUtcDay();

    return withDirectPgClient(async (client) => {
        const result = await client.query<AdminHomeCountsRow>(
            `
            SELECT
                (SELECT COUNT(*)::int FROM "User") AS "users_total",
                (SELECT COUNT(*)::int FROM "Question" WHERE "isActive" = true)
                    AS "questions_active",
                (SELECT COUNT(*)::int FROM "Question" WHERE "isActive" = false)
                    AS "questions_inactive",
                (
                    SELECT COUNT(*)::int
                    FROM "Question"
                    WHERE "type" = 'IMAGE_GUESS'::"QuestionType"
                ) AS "questions_image",
                (
                    SELECT COUNT(*)::int
                    FROM "Question"
                    WHERE "type" = 'TEXT'::"QuestionType"
                ) AS "questions_text",
                (
                    SELECT COUNT(*)::int
                    FROM "QuizSession"
                    WHERE "startedAt" >= $1
                ) AS "sessions_today"
            `,
            [dayStart],
        );

        const row = result.rows[0];

        return {
            usersTotal: Number(row?.users_total ?? 0),
            questionsActive: Number(row?.questions_active ?? 0),
            questionsInactive: Number(row?.questions_inactive ?? 0),
            questionsImage: Number(row?.questions_image ?? 0),
            questionsText: Number(row?.questions_text ?? 0),
            sessionsToday: Number(row?.sessions_today ?? 0),
        };
    });
}
