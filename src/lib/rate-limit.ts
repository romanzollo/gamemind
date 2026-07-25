/**
 * In-memory fixed-window rate limiter для Server Actions.
 *
 * Зачем: снизить brute-force (login/register/password) и злоупотребление
 * upload / quiz submit без внешнего Redis на MVP.
 *
 * Ограничение serverless: счётчик живёт в памяти инстанса Node.
 * На Vercel несколько инстансов не делят Map — это best-effort защита,
 * не строгий глобальный квотер. Если понадобится жёсткий лимит across
 * instances — заменить store на Upstash/Redis (см. ROADMAP §11.6).
 *
 * Dev/HMR: store на `globalThis` (как Prisma), иначе Turbopack пересоздаёт
 * модуль и Map обнуляется между попытками login — лимит «не срабатывает».
 *
 * Auth окно длиннее (15 мин): одна неудачная попытка на Neon+bcrypt может
 * занимать много секунд; при окне 60с счётчик успевал сбрасываться до лимита.
 *
 * Использование: собрать ключ `scope:identity`, вызвать `checkRateLimit`.
 * При `ok: false` вернуть errorCode RATE_LIMITED из action (не бросать 500).
 */

export type RateLimitResult =
    | {
          ok: true;
          remaining: number;
          resetAt: number;
      }
    | {
          ok: false;
          remaining: 0;
          resetAt: number;
          /** Сколько ждать до открытия окна (мс). */
          retryAfterMs: number;
      };

type Bucket = {
    count: number;
    resetAt: number;
};

const globalForRateLimit = globalThis as typeof globalThis & {
    __gamemindRateLimitBuckets?: Map<string, Bucket>;
};

/** Глобальный store на процесс — переживает HMR; на prod — per instance. */
const buckets =
    globalForRateLimit.__gamemindRateLimitBuckets ??
    new Map<string, Bucket>();
globalForRateLimit.__gamemindRateLimitBuckets = buckets;

const MAX_BUCKETS = 10_000;

/**
 * Пределы по сценариям. Identity в ключе выбирает вызывающий код
 * (IP для auth, userId для profile/quiz).
 */
export const RATE_LIMIT_PRESETS = {
    /**
     * Login / register. Окно 15 мин: медленные Neon+bcrypt попытки
     * всё равно накапливаются в один bucket (не сбрасываются за минуту).
     */
    auth: { limit: 10, windowMs: 15 * 60_000 },
    /** Смена пароля: дороже bcrypt + чувствительная операция. */
    password: { limit: 5, windowMs: 15 * 60_000 },
    /**
     * Avatar: sharp + Blob могут быть медленными — то же правило, что у auth:
     * короткое окно 60с при медленных попытках не набирает лимит.
     */
    avatar: { limit: 10, windowMs: 15 * 60_000 },
    /** Admin create/update (в т.ч. image upload). */
    upload: { limit: 20, windowMs: 15 * 60_000 },
    /**
     * startQuiz + submitQuiz (общий bucket на userId).
     * 30 / 15 мин: нормальной игре хватает; спам сессий при медленном Neon
     * всё ещё упирается в потолок (урок бага с auth 60с).
     */
    quiz: { limit: 30, windowMs: 15 * 60_000 },
} as const;

export type RateLimitPresetName = keyof typeof RATE_LIMIT_PRESETS;

function pruneExpired(now: number): void {
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) {
            buckets.delete(key);
        }
    }
}

/**
 * Фиксированное окно: в пределах windowMs не больше `limit` успешных consume.
 * Первый запрос в пустом/просроченном окне открывает новое окно.
 */
export function checkRateLimit(options: {
    key: string;
    limit: number;
    windowMs: number;
    now?: number;
}): RateLimitResult {
    const now = options.now ?? Date.now();
    const { key, limit, windowMs } = options;

    if (buckets.size > MAX_BUCKETS) {
        pruneExpired(now);
        // Защита от раздувания Map при атаке с уникальными ключами.
        if (buckets.size > MAX_BUCKETS) {
            buckets.clear();
        }
    }

    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
        const resetAt = now + windowMs;
        buckets.set(key, { count: 1, resetAt });
        return { ok: true, remaining: Math.max(0, limit - 1), resetAt };
    }

    if (existing.count >= limit) {
        return {
            ok: false,
            remaining: 0,
            resetAt: existing.resetAt,
            retryAfterMs: Math.max(0, existing.resetAt - now),
        };
    }

    existing.count += 1;
    return {
        ok: true,
        remaining: Math.max(0, limit - existing.count),
        resetAt: existing.resetAt,
    };
}

/** Удобная обёртка над пресетами — один вызов из Server Action. */
export function checkPresetRateLimit(
    preset: RateLimitPresetName,
    identityKey: string,
): RateLimitResult {
    const { limit, windowMs } = RATE_LIMIT_PRESETS[preset];
    return checkRateLimit({
        key: `${preset}:${identityKey}`,
        limit,
        windowMs,
    });
}

/** Только для тестов / отладки — не вызывать из production-кода фич. */
export function __resetRateLimitStoreForTests(): void {
    buckets.clear();
}
