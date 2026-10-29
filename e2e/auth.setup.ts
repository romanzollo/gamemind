/**
 * Вход служебного игрока один раз на прогон: сессия сохраняется в файл и
 * переиспользуется сценариями (проект `smoke` в playwright.config.ts).
 */

import { expect, test as setup } from '@playwright/test';

import { requireSmokeCredentials, SMOKE_AUTH_STATE_PATH } from './smoke-env';
import { waitForHydration } from './hydration';

setup('вход служебного игрока', async ({ page }) => {
    const { email, password } = requireSmokeCredentials();

    await page.goto('/ru/login');

    const form = page.getByTestId('login-form');
    const submit = form.locator('button[type="submit"]');

    await waitForHydration(submit);
    await form.locator('input[name="email"]').fill(email);
    await form.locator('input[name="password"]').fill(password);
    await submit.click();

    // loginAction уводит на главную; остались на /login — вход отклонён.
    await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/);

    await page.context().storageState({ path: SMOKE_AUTH_STATE_PATH });
});
