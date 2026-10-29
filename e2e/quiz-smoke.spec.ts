/**
 * Smoke горячего пути квиза — то, что раньше проходили руками после каждого
 * деплоя (канон — docs/QUIZ_NEON_HOT_PATH.md, матрица — skill gamemind-smoke).
 *
 * - Классика, Легко, 3 вопроса: старт → ответы → «Завершить» → результат.
 * - Блиц MIX: все ответы до 00:00 → результат без `clock=1` (таймер не
 *   должен «съесть» честную сдачу).
 *
 * Не покрыто: Выживание (ждать обнуления банка) и Челлендж дня (одна попытка
 * в сутки) — их проверяют руками, если трогали.
 *
 * Селекторы — data-testid и роли (radiogroup), не тексты: тексты интерфейса
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

async function answerEveryQuestion(page: Page): Promise<number> {
    const questions = page.getByRole('radiogroup');

    await waitForHydration(questions);

    const count = await questions.count();

    for (let index = 0; index < count; index += 1) {
        await questions.nth(index).locator('label').first().click();
    }

    return count;
}

async function submitAndOpenResult(page: Page): Promise<URL> {
    const submit = page.getByTestId('quiz-submit');

    await expect(submit).toBeEnabled();
    await submit.click();
    await page.waitForURL(RESULT_URL);
    await expect(page.getByTestId('quiz-result-score')).toBeVisible();

    return new URL(page.url());
}

test('Классика: Легко, 3 вопроса — от старта до результата', async ({
    page,
}) => {
    await startFromLobby(page, 'classic-setup', {
        difficulty: 'EASY',
        questionCount: '3',
    });

    expect(await answerEveryQuestion(page)).toBe(3);

    await submitAndOpenResult(page);
});

test('Блиц MIX: все ответы до 00:00 — результат без clock=1', async ({
    page,
}) => {
    await startFromLobby(page, 'blitz-setup', { difficulty: 'MIXED' });

    expect(await answerEveryQuestion(page)).toBe(
        TIMED_MODE_MVP_RULES.questionCount,
    );

    const resultUrl = await submitAndOpenResult(page);

    expect(resultUrl.searchParams.get('clock')).toBeNull();
});
