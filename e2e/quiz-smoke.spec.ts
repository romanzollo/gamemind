/**
 * Smoke горячего пути квиза — то, что раньше проходили руками после каждого
 * деплоя (канон — docs/QUIZ_NEON_HOT_PATH.md, матрица — skill gamemind-smoke).
 *
 * - Классика, Легко, 3 вопроса: старт → ответ → плашка → «Дальше» … →
 *   «К результату» → результат.
 * - Блиц MIX: все ответы до 00:00 (переход и сдача — сами) → результат без
 *   `clock=1` (таймер не должен «съесть» честную сдачу).
 *
 * Не покрыто: Выживание (ждать обнуления банка) и Челлендж дня (одна попытка
 * в сутки) — их проверяют руками, если трогали.
 *
 * Селекторы — data-testid (`quiz-play`, `quiz-question`, `quiz-option`,
 * `quiz-feedback`, `quiz-next`, `quiz-submit`), не тексты: тексты интерфейса
 * переписываются, и smoke не должен из-за этого краснеть. Ответ — всегда
 * первый вариант: проверяем путь, а не счёт.
 */

import { expect, test, type Page } from '@playwright/test';

import { TIMED_MODE_MVP_RULES } from '@/features/timed-mode/types';

import { waitForHydration } from './hydration';

const SESSION_URL = /\/ru\/quiz\/[^/?#]+/;
const RESULT_URL = /\/ru\/result\/[^/?#]+/;

async function startFromLobby(
    page: Page,
    setupTestId: 'classic-setup' | 'blitz-setup',
    options: { difficulty: string; questionCount?: string },
): Promise<void> {
    await page.goto('/ru/quiz');

    const setup = page.getByTestId(setupTestId);
    const start = setup.locator('button[type="submit"]');

    await waitForHydration(start);
    await setup
        .locator('select[name="difficulty"]')
        .selectOption(options.difficulty);

    if (options.questionCount) {
        await setup
            .locator('select[name="questionCount"]')
            .selectOption(options.questionCount);
    }

    await start.click();
    await page.waitForURL(SESSION_URL);
}

/**
 * Один вопрос на экране (Answer lock-in): ответ → плашка исхода от сервера →
 * «Дальше». Блиц переходит дальше сам и после последнего ответа сдаёт
 * партию сам — тогда «Дальше» не жмём.
 */
async function answerEveryQuestion(
    page: Page,
    options: { autoAdvance: boolean },
): Promise<number> {
    const play = page.getByTestId('quiz-play');
    const question = page.getByTestId('quiz-question');
    const firstOption = page.getByTestId('quiz-option').first();

    await waitForHydration(firstOption);

    const count = Number(await play.getAttribute('data-total'));

    for (let index = 0; index < count; index += 1) {
        await expect(question).toHaveAttribute('data-index', String(index));
        await expect(firstOption).toBeEnabled();
        await firstOption.click();
        // Исход пришёл с сервера — ответ зафиксирован.
        await expect(page.getByTestId('quiz-feedback')).toBeVisible();

        if (!options.autoAdvance && index < count - 1) {
            await page.getByTestId('quiz-next').click();
        }
    }

    return count;
}

async function openResult(page: Page): Promise<URL> {
    await page.waitForURL(RESULT_URL);
    await expect(page.getByTestId('quiz-result-score')).toBeVisible();

    return new URL(page.url());
}

async function submitAndOpenResult(page: Page): Promise<URL> {
    const submit = page.getByTestId('quiz-submit');

    await expect(submit).toBeEnabled();
    await submit.click();

    return openResult(page);
}

test('Классика: Легко, 3 вопроса — от старта до результата', async ({
    page,
}) => {
    await startFromLobby(page, 'classic-setup', {
        difficulty: 'EASY',
        questionCount: '3',
    });

    expect(await answerEveryQuestion(page, { autoAdvance: false })).toBe(3);

    await submitAndOpenResult(page);
});

test('Блиц MIX: все ответы до 00:00 — результат без clock=1', async ({
    page,
}) => {
    await startFromLobby(page, 'blitz-setup', { difficulty: 'MIXED' });

    expect(await answerEveryQuestion(page, { autoAdvance: true })).toBe(
        TIMED_MODE_MVP_RULES.questionCount,
    );

    // Последний ответ Блица сдаёт партию сам.
    const resultUrl = await openResult(page);

    expect(resultUrl.searchParams.get('clock')).toBeNull();
});
