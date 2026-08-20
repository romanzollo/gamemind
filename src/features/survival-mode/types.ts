/**
 * Контракт Survival mode — доменная модель feature-слоя (wave 2+ supersede).
 *
 * Зачем отдельный файл:
 * - одна точка правды для T0 / +4 / −6 / grace / волны / доски / пула;
 * - UI, start, submit, leaderboard и Vitest импортируют константы отсюда;
 * - старый A/B (exclusive best wave + cycle reshuffle) снят — не использовать.
 *
 * Canon: docs/DECISIONS.md → Survival Mode MVP (обновить в шаге docs).
 * Не мержить с Timed: Blitz = `timedEndsAt` + фиксированные 60с;
 * Survival = `timedEndsAt` NULL + банк, реконструкция на submit.
 *
 * Схема wave 2+ (нужна миграция):
 * - `SurvivalRun.totalScore` Int NOT NULL DEFAULT 0 — скаляр суммы clockOk-волн;
 * - `SurvivalRunSeenQuestion(runId, questionId)` PK — exclusion без JSONB;
 * - `bankRemainingSeconds` / `currentWaveIndex` уже есть (миграция 20260819163000).
 */

/**
 * Режим игры с точки зрения продукта.
 * CLASSIC / DAILY / TIMED уже живут в своих feature-модулях;
 * SURVIVAL — отдельный runner. Позже можно централизовать в quiz/types.
 */
export type QuizPlayMode = 'CLASSIC' | 'DAILY' | 'TIMED' | 'SURVIVAL';

/**
 * Сложность Survival. Mix (`MIXED` / `poolKind`) в этом режиме нет.
 */
export type SurvivalDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

/**
 * Wave 2+ — зафиксированные продуктовые выборы (чат Aug 20, supersede).
 *
 * A) Доска = best run total: скаляр `SurvivalRun.totalScore`
 *    (сумма score волн с `survivalClockOk=true`), не best одна волна.
 * B) Конец пула = exclusion seen ids на run (таблица, не cycle reshuffle).
 * C) CTA «Следующая волна»: clockOk && bank>0 && unseen>0.
 * D) Cut: unanswered без −6; T0' = budget−elapsed без grace → pooled scalar.
 */
export type SurvivalWaveCarryBoardPolicy = 'run_total_score_scalar';
export type SurvivalWaveCarryPoolEndPolicy = 'run_exclusion_seen_table';
export type SurvivalWaveCarryCutPolicy = 'unanswered_no_wrong_penalty';

/**
 * Почему на result нет CTA continue (честная plaque).
 * `null` / omit когда `canContinue === true`.
 */
export type SurvivalContinueBlockReason =
    | 'bank_empty'
    | 'clock_cut'
    | 'pool_exhausted';

/**
 * Правила Survival — одна точка правды для тестов, ADR и actions.
 *
 * Волна = frozen snapshot (обычно 12; последняя может быть 1..11, если
 * остаток unseen меньше полной волны). Клиентский remaining — только UX.
 * Авторитет часов: `startedAt` / `completedAt` + correct/wrong из snapshot.
 * Не UPDATE `timedEndsAt` на ответ.
 *
 * Endless = N × QuizSession на одном SurvivalRun, не рост `snapshotData`.
 * Pick во время игры запрещён. Continue ≠ Classic.
 */
export const SURVIVAL_MODE_MVP_RULES = {
    /**
     * Целевой размер полной волны. Последняя короткая: 1..11, если
     * `remainingUnseen` в этом диапазоне. Не 40+ (TOAST).
     */
    questionCount: 12,
    /**
     * Стартовый банк волны 1 (секунды). Волна 2+ берёт T0' со скаляра
     * `SurvivalRun.bankRemainingSeconds` (после complete предыдущей волны).
     */
    initialBankSeconds: 20,
    /** Начисление к банку за верный ответ. Не меняет `scoring.ts`. */
    correctDeltaSeconds: 4,
    /**
     * Штраф банка за неверный. Unanswered на auto-submit / cut не штрафуем
     * (как Blitz: нет ответа = 0 очков, без −6с). Выбор D.
     */
    wrongDeltaSeconds: 6,
    /**
     * Допуск на сеть/склок при сверке elapsed vs budget (секунды).
     * Сравнивать: `elapsed <= budget + grace`,
     * где `elapsed = completedAt - startedAt`.
     * Не прибавлять grace к elapsed. Не использовать grace при записи T0'.
     */
    graceSeconds: 3,
    /** Игрок выбирает EASY|MEDIUM|HARD. Mix нет. */
    difficultySource: 'player_choice_single' as const,
    /**
     * Попытки не ограничены календарным днём (это не Daily).
     * Новый забег (lobby / rematch) всегда создаёт новый `SurvivalRun` (T0=20).
     * «Следующая волна» = тот же run + waveIndex++ + exclude=seen(run).
     */
    attemptsPolicy: 'unlimited' as const,
    /**
     * Застрявшие Survival-сессии:
     * - новый run / rematch: abandon чужие IN_PROGRESS Survival sessions+runs
     *   этого user (scoped: `survivalRunId IS NOT NULL`);
     * - continue same run: НЕ abandon’ить этот `runId`.
     *
     * Почему abandon, а не resume — давление по часам; «продолжить через час»
     * ломает банк. Daily resume — другой продукт.
     *
     * Scope: только Survival. Hop: pooled scalar **до** pick.
     */
    stuckSessionPolicy: 'abandon_on_new_start' as const,
    /**
     * Доска (выбор A): best run total per user.
     * Скаляр `SurvivalRun.totalScore` обновляется pooled AFTER каждой
     * успешной волны с `survivalClockOk=true` (+ score этой волны).
     * Wave с clockOk=false не добавляет очки к run total и не на доску.
     * Не мешать в Classic/Blitz/Daily. Week/all period сохранить.
     *
     * Альтернатива SUM JOIN на read отклонена как более тяжёлая для Neon
     * при том же продукте — скаляр проще и безопаснее hot path.
     */
    leaderboardPolicy: 'run_total_score_scalar' as const satisfies SurvivalWaveCarryBoardPolicy,
    /**
     * Pick Survival: один path всегда — id-pool difficulty минус seen(run),
     * shuffle, limit N (12 или remainder 1..11). Wave 1: seen=[].
     * НЕ голый Classic cycle для continue (дайёт повторы внутри run).
     * Classic/Timed cycle не ломаем; Daily cycle не использует.
     * ADR: run-scoped exclusion supersedes «same bag for all waves».
     */
    pickPolicy: 'survival_exclusion_pool' as const,
    /**
     * Конец пула (выбор B): таблица `SurvivalRunSeenQuestion`.
     * Live pool = isActive+PUBLISHED+difficulty − seen(run).
     * remaining=0 → run COMPLETED (pool exhausted), CTA нет.
     * remaining 1..11 → короткая последняя волна.
     * remaining ≥12 → полная волна 12.
     * Не JSONB 40+ ids. Не fat array в completeWithResult.
     */
    waveCarryPoolEndPolicy:
        'run_exclusion_seen_table' as const satisfies SurvivalWaveCarryPoolEndPolicy,
    /**
     * CTA «Следующая волна» (выбор C) только если все три:
     * clockOk && bankRemainingSeconds>0 && remainingUnseen>0.
     * Иначе plaque (bank_empty / clock_cut / pool_exhausted) + rematch = новый run.
     */
    waveCarryContinueRequires: {
        clockOk: true,
        bankRemainingPositive: true,
        remainingUnseenPositive: true,
    } as const,
    /**
     * После успешного complete волны (pooled after-hop, не completeWithResult):
     * 1) T0' = reconstruct remaining (budget − elapsed, **без** grace);
     * 2) append seen ids волны;
     * 3) bump `currentWaveIndex`;
     * 4) если clockOk — add wave score к `SurvivalRun.totalScore`;
     * 5) COMPLETED run, если bank=0 или unseen=0 (или rematch/abandon).
     * Не client remaining. Не duration/bank JSONB в complete hop.
     */
    waveCarryBankWrite: 'pooled_scalar_after_complete' as const,
    /**
     * Cut (выбор D): unanswered не дают −6 (уже в isSurvivalClockOk /
     * wrongCount только из явных неверных).
     */
    waveCarryCutPolicy:
        'unanswered_no_wrong_penalty' as const satisfies SurvivalWaveCarryCutPolicy,
} as const;

/**
 * Сколько вопросов заморозить в следующей волне по остатку unseen.
 * Pure helper для start runner / eligibility (без Neon).
 */
export function resolveSurvivalWaveQuestionCount(
    remainingUnseen: number,
    fullWaveSize: number = SURVIVAL_MODE_MVP_RULES.questionCount,
): number {
    if (remainingUnseen <= 0) {
        return 0;
    }
    if (remainingUnseen < fullWaveSize) {
        return remainingUnseen;
    }
    return fullWaveSize;
}

/**
 * Публичный контракт волны для UI (play DTO).
 * `remainingSeconds` считает клиент; сервер на submit это поле не читает.
 * Волна 2+: `initialBankSeconds` = T0' с run (carry), не всегда 20.
 */
export type SurvivalSessionPublicState = {
    sessionId: string;
    runId: string;
    waveIndex: number;
    /** ISO `startedAt` с INSERT (JS Date после connect), для гидрации банка. */
    startedAt: string;
    initialBankSeconds: number;
    correctDeltaSeconds: number;
    wrongDeltaSeconds: number;
    difficulty: SurvivalDifficulty;
    /** Фактический размер этой волны (12 или короткая 1..11). */
    questionCount: number;
};

/**
 * Gate CTA «Следующая волна» на result (сервер считает, клиент не доверяем).
 * Соответствует `waveCarryContinueRequires`.
 */
export type SurvivalNextWaveEligibility = {
    canContinue: boolean;
    runId: string;
    nextWaveIndex: number;
    /** T0' для следующей волны; null если continue нельзя. */
    bankRemainingSeconds: number | null;
    clockOk: boolean;
    /** Сколько published+difficulty вопросов ещё не в seen(run). */
    remainingUnseen: number;
    /** Размер следующей волны, если canContinue; иначе 0. */
    nextWaveQuestionCount: number;
    /** Причина plaque, когда continue нельзя. */
    blockReason: SurvivalContinueBlockReason | null;
};

/**
 * Вход чистой реконструкции T0' после complete (без grace).
 * Vitest в шаге pure; запись — pooled after-hop.
 *
 * `budget = max(0, T0 + plus×correct − minus×wrong)`
 * `remaining = max(0, floor((budgetMs − elapsedMs) / 1000))` — без grace.
 */
export type SurvivalBankRemainingReconstructInput = {
    startedAtMs: number;
    completedAtMs: number;
    correctCount: number;
    wrongCount: number;
    initialBankSeconds?: number;
    correctDeltaSeconds?: number;
    wrongDeltaSeconds?: number;
};

/**
 * Коды ошибок, специфичные для Survival (поверх общих QuizErrorCode).
 * Невалидные часы не void’ят result — строка пишется; clockOk=false
 * → волна не в run total / не на доску.
 */
export type SurvivalModeErrorCode =
    /** Сессия не Survival, а action/UI ожидали Survival. */
    | 'NOT_SURVIVAL_SESSION'
    /**
     * Submit за пределами budget+grace: complete всё равно,
     * `survivalClockOk = false` → score волны не в `totalScore`.
     */
    | 'SURVIVAL_CLOCK_INVALID'
    /**
     * CTA continue: run не IN_PROGRESS / банк ≤ 0 / clock не ok /
     * unseen=0 / чужой user — не стартуем волну N+1 на этом run.
     */
    | 'SURVIVAL_CANNOT_CONTINUE'
    /**
     * Exclusion pick: published pool минус seen пуст (или 0 ids).
     * На start continue → terminal run; на wave 1 нового run — как
     * NOT_ENOUGH_QUESTIONS для difficulty.
     */
    | 'SURVIVAL_POOL_EXHAUSTED';

/**
 * Вход чистой сверки банка (Vitest; не hot path).
 *
 * `budget = max(0, T0 + plus×correct − minus×wrong)`
 * `clockOk ⇔ elapsedMs <= budgetMs + graceMs`
 *
 * Волна 2+: `initialBankSeconds` = T0' с `SurvivalRun.bankRemainingSeconds`.
 */
export type SurvivalClockCheckInput = {
    startedAtMs: number;
    completedAtMs: number;
    correctCount: number;
    wrongCount: number;
    initialBankSeconds?: number;
    correctDeltaSeconds?: number;
    wrongDeltaSeconds?: number;
    graceSeconds?: number;
};
