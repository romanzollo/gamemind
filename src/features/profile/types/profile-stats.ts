/**
 * Агрегаты профиля по завершённым квизам (таблица QuizResult).
 *
 * Зачем отдельный тип: история показывает последние N строк; сводка — один
 * взгляд на прогресс без скана всей истории в UI. Считаем на сервере (SQL),
 * не доверяем клиенту. Scoring/snapshot hot path не трогаем — только чтение
 * уже сохранённых результатов.
 *
 * Пустой профиль (quizzesCompleted === 0): bestScore / averageAccuracyPercent /
 * lastPlayedAt = null — UI покажет empty, а не «0 очков / 0%».
 */
export type ProfileStats = {
    /** Сколько завершённых квизов (строк QuizResult у пользователя). */
    quizzesCompleted: number;
    /** Лучший weighted score; null если квизов ещё не было. */
    bestScore: number | null;
    /**
     * Средняя точность в процентах 0–100:
     * round(100 * sum(correctCount) / sum(totalQuestions)).
     * null если квизов нет или sum(totalQuestions) = 0.
     */
    averageAccuracyPercent: number | null;
    /** Дата последнего завершённого квиза; null если квизов не было. */
    lastPlayedAt: Date | null;
};
