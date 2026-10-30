/**
 * Непрозрачные id вопросов и вариантов в данных игры, которые видит браузер.
 *
 * Зачем: id из БД выдавали ответ — у импорта верный вариант всегда первый
 * (`…-opt-0` / `-opt-1`), а id вопросов-картинок содержат слаг игры
 * (`img-med-bg3`). Перемешанный порядок на экране не спасал: DevTools
 * показывали id. Теперь клиент получает токены, сервер переводит их обратно.
 *
 * Токен = HMAC-SHA256(AUTH_SECRET, домен + сессия + id), base64url, 16 символов.
 * - вычисляется, а не хранится: без миграции и без лишнего hop к Neon;
 * - стабилен в пределах сессии (перезагрузка страницы игры не ломает форму);
 * - в другой сессии тот же вопрос даёт другой токен — сопоставить нельзя.
 *
 * Только сервер (node:crypto). Не импортировать в Client Components.
 * Canon: docs/DECISIONS.md → Quiz answer leak (opaque play ids).
 */

import { createHmac } from 'node:crypto';

import type { SessionSnapshotPublicQuestion } from '@/entities/quiz-session/quiz-session.types';

/** Отделяет эти HMAC от любых других применений AUTH_SECRET. */
const DOMAIN = 'gamemind:quiz-play-ids:v1';
const TOKEN_LENGTH = 16;

export type QuizPublicIdCodec = {
    question: (questionId: string) => string;
    option: (optionId: string) => string;
};

function resolveSecret(secret: string | undefined): string {
    const value = secret ?? process.env.AUTH_SECRET;
    if (!value) {
        // Без секрета токены стали бы предсказуемыми — лучше явная ошибка.
        throw new Error('AUTH_SECRET is required for quiz play ids');
    }
    return value;
}

/**
 * Кодек одной сессии. `secret` — только для тестов; в приложении AUTH_SECRET.
 */
export function createQuizPublicIdCodec(
    sessionId: string,
    secret?: string,
): QuizPublicIdCodec {
    const key = resolveSecret(secret);
    const token = (kind: 'q' | 'o', id: string) =>
        createHmac('sha256', key)
            .update(`${DOMAIN}:${sessionId}:${kind}:${id}`)
            .digest('base64url')
            .slice(0, TOKEN_LENGTH);

    return {
        question: (questionId) => token('q', questionId),
        option: (optionId) => token('o', optionId),
    };
}

/** Публичные вопросы с id из БД → те же вопросы с токенами (всё остальное как было). */
export function encodePublicQuestionIds(
    questions: readonly SessionSnapshotPublicQuestion[],
    codec: QuizPublicIdCodec,
): SessionSnapshotPublicQuestion[] {
    return questions.map((question) => ({
        ...question,
        id: codec.question(question.id),
        options: question.options.map((option) => ({
            ...option,
            id: codec.option(option.id),
        })),
    }));
}

type ScoringQuestionIds = {
    id: string;
    options: ReadonlyArray<{ id: string }>;
};

/**
 * Ответы из формы сдачи: поле = токен вопроса, значение = токен варианта.
 * Возвращает id из БД. Неизвестный токен варианта остаётся как есть —
 * он не совпадёт ни с одним вариантом, и сдача вернёт INVALID_ANSWER.
 *
 * Страница, открытая до перехода на токены, шлёт id из БД: если в форме нет
 * ни одного токена вопроса, читаем старые имена. Это не слабее прежнего
 * поведения, а новые страницы id из БД уже не показывают.
 */
export function readSubmittedAnswers(
    formData: Pick<FormData, 'get'>,
    questions: readonly ScoringQuestionIds[],
    codec: QuizPublicIdCodec,
): Array<{ questionId: string; selectedOptionId: string }> {
    const asString = (value: FormDataEntryValue | null) =>
        typeof value === 'string' ? value : '';

    const usesTokens = questions.some(
        (question) => formData.get(codec.question(question.id)) !== null,
    );

    return questions.map((question) => {
        if (!usesTokens) {
            return {
                questionId: question.id,
                selectedOptionId: asString(formData.get(question.id)),
            };
        }

        const submitted = asString(formData.get(codec.question(question.id)));
        const option = question.options.find(
            (item) => codec.option(item.id) === submitted,
        );

        return {
            questionId: question.id,
            selectedOptionId: option ? option.id : submitted,
        };
    });
}
