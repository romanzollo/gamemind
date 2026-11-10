/**
 * Подпись трека для разбора AUDIO_GUESS: «трек · композитор».
 *
 * Зачем отдельный запрос: в снапшоте партии только URL клипа (ADR), а
 * подпись нужна лишь в разборе после игры. Разбор — best-effort и не на
 * горячем пути: один короткий pooled SELECT по id аудиовопросов партии,
 * вне Direct-очереди. Сбой → разбор без подписи, не ошибка.
 *
 * ADR: docs/DECISIONS.md → Audio questions: AUDIO_GUESS (Rights).
 */

import { withPooledPgClient } from '@/lib/db/direct-pg';

export type QuestionAudioCredit = {
    track: string;
    composer: string;
};

/** Подписи по id вопроса; вопросы без трека в metadata пропускаются. */
export async function findAudioCreditsByQuestionIds(
    questionIds: readonly string[],
): Promise<Map<string, QuestionAudioCredit>> {
    const credits = new Map<string, QuestionAudioCredit>();
    if (questionIds.length === 0) {
        return credits;
    }

    const result = await withPooledPgClient(
        (client) =>
            client.query<{ id: string; track: string | null; composer: string | null }>(
                `
                    SELECT q."id",
                           q."metadata"->>'track' AS track,
                           q."metadata"->>'composer' AS composer
                    FROM "Question" q
                    WHERE q."id" = ANY($1::text[])
                      AND q."type" = 'AUDIO_GUESS'::"QuestionType"
                `,
                [questionIds],
            ),
        { debugLabel: 'quiz.result.audio-credits', attemptTimeoutMs: 5_000 },
    );

    for (const row of result.rows) {
        const track = row.track?.trim();
        const composer = row.composer?.trim();
        if (track && composer) {
            credits.set(row.id, { track, composer });
        }
    }
    return credits;
}
