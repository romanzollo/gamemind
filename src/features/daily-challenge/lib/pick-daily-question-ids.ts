/**
 * Детерминированный выбор question id для Daily Challenge.
 *
 * Зачем не Math.random / ORDER BY RANDOM():
 * - все игроки в один день должны получить один и тот же набор и порядок;
 * - повторный get-or-create после гонки должен уметь пересчитать тот же pick
 *   только для диагностики — в БД источник правды после INSERT.
 *
 * Алгоритм:
 * 1) сортируем кандидатов (стабильный вход, не зависеть от порядка SQL);
 * 2) Fisher–Yates с seeded RNG (mulberry32) от `seedKey` (обычно YYYY-MM-DD);
 * 3) берём первые `count` id.
 *
 * Canon: DECISIONS → Daily Challenge MVP.
 */

/**
 * FNV-1a 32-bit → seed для mulberry32.
 * Достаточно для quiz id shuffle; не криптография.
 */
export function hashStringToSeed(input: string): number {
    let hash = 0x811c9dc5;

    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
}

/** Mulberry32 — простой детерминированный PRNG из 32-bit seed. */
export function createMulberry32(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Выбирает `count` id из пула. Если пул меньше `count` — пустой массив
 * (caller решает insufficient_pool; здесь не бросаем, чтобы UI мог смапить reason).
 */
export function pickDailyQuestionIds(
    candidateIds: readonly string[],
    count: number,
    seedKey: string,
): string[] {
    if (count <= 0) {
        return [];
    }

    if (candidateIds.length < count) {
        return [];
    }

    const sorted = [...candidateIds].sort((left, right) =>
        left.localeCompare(right),
    );
    const random = createMulberry32(
        hashStringToSeed(`daily-challenge:${seedKey}`),
    );
    const shuffled = [...sorted];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        const current = shuffled[index];
        shuffled[index] = shuffled[swapIndex]!;
        shuffled[swapIndex] = current!;
    }

    return shuffled.slice(0, count);
}
