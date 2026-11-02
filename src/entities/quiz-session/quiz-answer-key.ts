/**
 * Ключ ответа вопроса: зашифрованная записка «сессия, вопрос, его варианты,
 * какой верный», которую сервер отдаёт вместе с вопросом и получает обратно
 * с ответом игрока.
 *
 * Зачем: проверка ответа на сервере без чтения `snapshotData` (TOAST) на
 * каждый ответ — именно такие чтения висели 18–40 s (QUIZ_NEON_HOT_PATH).
 * Браузер записку не прочитает и не подделает: AES-256-GCM, ключ выводится
 * из AUTH_SECRET (HKDF, свой домен — не пересекается с другими HMAC).
 * Записка привязана к сессии: в чужой партии `open` вернёт null.
 *
 * Только сервер (node:crypto). Не импортировать в Client Components.
 * Canon: docs/DECISIONS.md → Answer lock-in.
 */

import {
    createCipheriv,
    createDecipheriv,
    hkdfSync,
    randomBytes,
} from 'node:crypto';

const INFO = 'gamemind:quiz-answer-key:v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Что лежит в ключе. id — из БД (снаружи их не видно). */
export type QuizAnswerKeyPayload = {
    sessionId: string;
    questionId: string;
    optionIds: string[];
    correctOptionId: string;
};

type SealedV1 = {
    v: 1;
    s: string;
    q: string;
    o: string[];
    c: string;
};

function deriveKey(secret: string | undefined): Buffer {
    const value = secret ?? process.env.AUTH_SECRET;
    if (!value) {
        // Без секрета ключ был бы предсказуемым — лучше явная ошибка.
        throw new Error('AUTH_SECRET is required for quiz answer keys');
    }
    return Buffer.from(hkdfSync('sha256', value, '', INFO, 32));
}

/** `secret` — только для тестов; в приложении AUTH_SECRET. */
export function sealQuizAnswerKey(
    payload: QuizAnswerKeyPayload,
    secret?: string,
): string {
    const body: SealedV1 = {
        v: 1,
        s: payload.sessionId,
        q: payload.questionId,
        o: payload.optionIds,
        c: payload.correctOptionId,
    };
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
    const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(body), 'utf8'),
        cipher.final(),
    ]);

    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
        'base64url',
    );
}

/**
 * Расшифровка. null — подделка, обрезка, другой секрет или чужая сессия:
 * вызывающий отвечает 400, не объясняя причину.
 */
export function openQuizAnswerKey(
    token: string,
    expectedSessionId: string,
    secret?: string,
): QuizAnswerKeyPayload | null {
    let raw: Buffer;
    try {
        raw = Buffer.from(token, 'base64url');
    } catch {
        return null;
    }
    if (raw.length <= IV_BYTES + TAG_BYTES) {
        return null;
    }

    let body: unknown;
    try {
        const decipher = createDecipheriv(
            'aes-256-gcm',
            deriveKey(secret),
            raw.subarray(0, IV_BYTES),
        );
        decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
        body = JSON.parse(
            Buffer.concat([
                decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
                decipher.final(),
            ]).toString('utf8'),
        );
    } catch {
        return null;
    }

    if (!isSealedV1(body) || body.s !== expectedSessionId) {
        return null;
    }

    return {
        sessionId: body.s,
        questionId: body.q,
        optionIds: body.o,
        correctOptionId: body.c,
    };
}

function isSealedV1(value: unknown): value is SealedV1 {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const body = value as Record<string, unknown>;
    return (
        body.v === 1 &&
        typeof body.s === 'string' &&
        typeof body.q === 'string' &&
        typeof body.c === 'string' &&
        Array.isArray(body.o) &&
        body.o.every((id) => typeof id === 'string') &&
        body.o.includes(body.c)
    );
}
