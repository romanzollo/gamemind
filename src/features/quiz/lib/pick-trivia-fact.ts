/**
 * Какой факт «А ты знал?» показать к вопросу партии.
 *
 * Правила (ADR «Did you know: trivia facts»):
 * - факт игры важнее факта серии: серия — запасной вариант, когда у игры
 *   своих фактов нет или они уже были в этой партии;
 * - выбор детерминированный: хеш от (партия, вопрос) по кандидатам,
 *   отсортированным по ключу. Плашка после ответа и разбор считают одно и
 *   то же — и показывают одну и ту же строку; другая партия — скорее всего,
 *   другой факт. Ничего не пишем в БД;
 * - факт, уже показанный в этой партии (`exclude`), второй раз не берём —
 *   лучше без факта, чем повтор.
 *
 * Чистая функция: вызывают маршрут факта и маршрут разбора.
 */

export type TriviaFactFacet = 'game' | 'franchise';

export type TriviaFactCandidate = {
    key: string;
    facet: TriviaFactFacet;
    textRu: string;
    textEn: string;
    sourceUrl: string;
};

/** Порядок предпочтения измерений: раньше в списке — важнее. */
const FACET_PRIORITY: readonly TriviaFactFacet[] = ['game', 'franchise'];

/** FNV-1a 32 бит: стабилен между сервером и тестами, без зависимостей. */
export function hashSeed(seed: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

export function triviaFactSeed(sessionId: string, questionId: string): string {
    return `${sessionId}:${questionId}`;
}

export function pickTriviaFact(
    candidates: readonly TriviaFactCandidate[],
    options: { seed: string; exclude?: Iterable<string> },
): TriviaFactCandidate | null {
    const excluded = new Set(options.exclude ?? []);

    for (const facet of FACET_PRIORITY) {
        const pool = candidates
            .filter((fact) => fact.facet === facet && !excluded.has(fact.key))
            // Дубли ключа (метка игры попала к вопросу дважды) — один кандидат.
            .filter(
                (fact, index, list) =>
                    list.findIndex((other) => other.key === fact.key) === index,
            )
            .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        if (pool.length > 0) {
            return pool[hashSeed(options.seed) % pool.length];
        }
    }
    return null;
}

/**
 * Факты к вопросам разбора — в порядке вопросов, без повторов в партии
 * (тот же порядок, в каком их показывала плашка).
 */
export function pickTriviaFactsForSession(
    sessionId: string,
    questions: ReadonlyArray<{ questionId: string; position: number }>,
    candidatesByQuestion: ReadonlyMap<string, readonly TriviaFactCandidate[]>,
): Map<string, TriviaFactCandidate> {
    const picked = new Map<string, TriviaFactCandidate>();
    const shown: string[] = [];

    for (const question of [...questions].sort(
        (a, b) => a.position - b.position,
    )) {
        const fact = pickTriviaFact(
            candidatesByQuestion.get(question.questionId) ?? [],
            {
                seed: triviaFactSeed(sessionId, question.questionId),
                exclude: shown,
            },
        );
        if (fact) {
            picked.set(question.questionId, fact);
            shown.push(fact.key);
        }
    }
    return picked;
}
