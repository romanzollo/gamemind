/**
 * Seeded Fisher–Yates (mulberry32) — для детерминированных мешков.
 * Не криптография. Daily Challenge использует тот же класс алгоритма.
 */

export function hashStringToSeed(input: string): number {
    let hash = 0x811c9dc5;

    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
}

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

/** Стабильный вход: sort → shuffle с seed. */
export function shuffleWithSeed<T>(
    items: readonly T[],
    seed: number,
    compare?: (left: T, right: T) => number,
): T[] {
    const shuffled = compare
        ? [...items].sort(compare)
        : [...items];

    const random = createMulberry32(seed);

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        const current = shuffled[index];
        shuffled[index] = shuffled[swapIndex]!;
        shuffled[swapIndex] = current!;
    }

    return shuffled;
}

export function randomCycleSeed(): number {
    // Prisma/Postgres Int = signed int32 (max 2^31-1); mulberry32 всё равно берёт seed >>> 0.
    return (Math.floor(Math.random() * 0x7fffffff) || 1);
}
