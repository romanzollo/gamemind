/**
 * Банк, с которым стартует следующая волна Survival (pure, без Neon).
 *
 * - Волна оборвалась по банку (клиент прислал `survivalWaveEnd=cut|bank`)
 *   → 0: банк кончился — забег кончился. Не доверяем «остатку» по часам:
 *   часы устройства могут спешить, и тогда сервер видел остаток 1–2 с
 *   и предлагал «следующую волну», которая тут же обрывалась (прод,
 *   окт 2026). Соврать в свою пользу клиент так не может: без флага
 *   остаток всё равно считает сервер.
 * - Остаток > 0 → не меньше `minWaveStartBankSeconds`: с 1 секундой новую
 *   волну не успеть даже прочитать. Если в запасе больше — ничего не
 *   добавляем.
 * - Остаток 0 → 0.
 *
 * ADR: docs/DECISIONS.md → Survival clock — server time sync and wave start.
 */

import { SURVIVAL_MODE_MVP_RULES } from '@/features/survival-mode/types';

export type ResolveSurvivalNextWaveBankInput = {
    /** reconstructSurvivalBankRemainingSeconds: целые секунды по серверу. */
    reconstructedSeconds: number;
    /** Клиент закончил волну по нулю банка (`cut` / `bank`). */
    endedOnBank: boolean;
    minWaveStartBankSeconds?: number;
};

export function resolveSurvivalNextWaveBankSeconds({
    reconstructedSeconds,
    endedOnBank,
    minWaveStartBankSeconds = SURVIVAL_MODE_MVP_RULES.minWaveStartBankSeconds,
}: ResolveSurvivalNextWaveBankInput): number {
    if (endedOnBank || !Number.isFinite(reconstructedSeconds)) {
        return 0;
    }

    const remaining = Math.floor(reconstructedSeconds);

    if (remaining <= 0) {
        return 0;
    }

    return Math.max(remaining, minWaveStartBankSeconds);
}
