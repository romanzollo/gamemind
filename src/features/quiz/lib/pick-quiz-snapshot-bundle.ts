/**
 * Mode-specific wrappers над random snapshot pick.
 *
 * Зачем отдельные функции при одном SQL сейчас:
 * - правка «под Classic 10Q» больше не выглядит как бесплатный side-effect на Blitz;
 * - в комментариях и review видно контракт режима + матрицу проверки;
 * - позже путь можно развести без охоты по actions.
 *
 * Canon: docs/DECISIONS.md → Quiz Start / Session Load Playbook.
 * Менять underlying pick — только с матрицей Classic 3/5/10 + Blitz 10.
 */

import { questionRepository } from '@/entities/question/question.repository';
import type { QuestionSnapshotBundleItem } from '@/entities/question/question.types';
import type { Locale } from '@/shared/i18n';
import type { Difficulty } from '@/types';

/**
 * Classic lobby/rematch pick.
 * Матрица: Easy 3 → 5 → 10 без DB_TIMEOUT.
 */
export function pickClassicSnapshotBundle(
    difficulty: Difficulty,
    questionCount: number,
    locale: Locale,
): Promise<QuestionSnapshotBundleItem[]> {
    return questionRepository.pickRandomActiveSnapshotBundle(
        difficulty,
        questionCount,
        locale,
    );
}

/**
 * Blitz/Timed pick (всегда 10Q по MVP rules).
 * Матрица: старт 303, timedEndsAt ≈ now+60s после create, result после submit.
 * Не «ускорять Classic» правкой этого wrapper без прогона Blitz.
 */
export function pickTimedSnapshotBundle(
    difficulty: Difficulty,
    questionCount: number,
    locale: Locale,
): Promise<QuestionSnapshotBundleItem[]> {
    return questionRepository.pickRandomActiveSnapshotBundle(
        difficulty,
        questionCount,
        locale,
    );
}
