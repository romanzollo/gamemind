/**
 * Дождаться, пока React «оживит» серверную разметку элемента.
 *
 * Зачем: Playwright кликает, как только HTML виден. До гидратации клик по
 * кнопке или варианту ответа не доходит до React-состояния формы — тест
 * падал бы на таймауте, хотя продукт исправен. Человек так быстро не
 * кликает, поэтому ждём здесь, а не правим приложение.
 *
 * Признак гидратации — служебное свойство `__reactProps$…`, которое React
 * вешает на DOM-узел. Это деталь React, а не наш контракт: если после
 * обновления React ожидание начнёт падать, первым делом смотреть сюда.
 */

import { expect, type Locator } from '@playwright/test';

export async function waitForHydration(locator: Locator): Promise<void> {
    const element = locator.first();

    await element.waitFor();
    await expect
        .poll(
            () =>
                element.evaluate((node) =>
                    Object.keys(node).some((key) =>
                        key.startsWith('__reactProps$'),
                    ),
                ),
            { message: 'React did not hydrate the element' },
        )
        .toBe(true);
}
