/**
 * Текст «Поделиться результатом» и ссылки на мессенджеры (pure).
 *
 * Формат как у Wordle: заголовок режима, счёт, строка квадратиков по
 * вопросам (🟩 верно, 🟥 неверно, ⬜ без ответа), серия Челленджа, призыв
 * со ссылкой. Эмодзи — только в тексте, который уходит в мессенджер: это
 * общепринятый формат шаринга; в интерфейсе эмодзи нет (docs/DESIGN.md).
 *
 * Ссылки «поделиться»: Telegram `t.me/share/url` (ссылку добавляет сам),
 * VK `vk.com/share.php` (берёт заголовок и превью по Open Graph), MAX
 * `max.ru/:share?text=` (выбор чата; iOS / Android / веб).
 * ADR: docs/DECISIONS.md → Share result.
 */

import { formatPlural, type Locale, type PluralForms } from '@/shared/i18n';

export type ShareSquare = 'correct' | 'wrong' | 'none';

/** Квадратики по вопросам; общие с текстом «Вызова другу». */
export const SQUARE_EMOJI: Record<ShareSquare, string> = {
    correct: '🟩',
    wrong: '🟥',
    none: '⬜',
};

export type ResultShareLabels = {
    /** `{correct}/{total} · {points}` */
    scoreLine: string;
    points: PluralForms;
    /** `{points} за забег · волна {wave}` */
    survivalLine: string;
    /** `Серия: {days}` */
    streakLine: string;
    streakDays: PluralForms;
    invite: string;
};

export type ResultShareInput =
    | {
          kind: 'quiz';
          title: string;
          correct: number;
          total: number;
          score: number;
          /** null — разбор ещё не загрузился: текст без квадратиков. */
          squares: ShareSquare[] | null;
          /** Только для Челленджа; null — строки серии нет. */
          streakDays: number | null;
      }
    | {
          kind: 'survival';
          title: string;
          runScore: number;
          waveIndex: number;
      };

export type ResultShare = {
    title: string;
    /** Полный текст со ссылкой — для системного меню, буфера и MAX. */
    text: string;
    /** Без ссылки — Telegram дописывает её сам. */
    textWithoutUrl: string;
    url: string;
};

/**
 * Квадратики по позициям 0..total−1 (как в разборе: UI показывает
 * position + 1); позиция без ответа в разборе — ⬜.
 */
export function buildShareSquares(
    items: ReadonlyArray<{ position: number; isCorrect: boolean }>,
    total: number,
): ShareSquare[] {
    const byPosition = new Map(items.map((item) => [item.position, item.isCorrect]));

    return Array.from({ length: Math.max(0, total) }, (_, index) => {
        const isCorrect = byPosition.get(index);
        return isCorrect == null ? 'none' : isCorrect ? 'correct' : 'wrong';
    });
}

export function buildResultShare(
    input: ResultShareInput,
    labels: ResultShareLabels,
    locale: Locale,
    url: string,
): ResultShare {
    const lines = [input.title];

    if (input.kind === 'survival') {
        lines.push(
            labels.survivalLine
                .replace('{points}', formatPlural(locale, input.runScore, labels.points))
                .replace('{wave}', String(input.waveIndex)),
        );
    } else {
        lines.push(
            labels.scoreLine
                .replace('{correct}', String(input.correct))
                .replace('{total}', String(input.total))
                .replace('{points}', formatPlural(locale, input.score, labels.points)),
        );

        if (input.squares && input.squares.length > 0) {
            lines.push(input.squares.map((square) => SQUARE_EMOJI[square]).join(''));
        }

        if (input.streakDays != null && input.streakDays > 0) {
            lines.push(
                labels.streakLine.replace(
                    '{days}',
                    formatPlural(locale, input.streakDays, labels.streakDays),
                ),
            );
        }
    }

    const textWithoutUrl = [...lines, labels.invite].join('\n');

    return {
        title: input.title,
        text: `${textWithoutUrl} ${url}`,
        textWithoutUrl,
        url,
    };
}

const MOSCOW_DAY_MONTH = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
});

export type ShareTitleLabels = {
    titleDaily: string;
    titleClassic: string;
    titleBlitz: string;
    titleSurvival: string;
};

/** Первая строка: режим и сложность; у Челленджа — дата дня по Москве (дд.мм). */
export function buildShareTitle(
    input: {
        mode: 'daily' | 'classic' | 'blitz' | 'survival';
        difficultyLabel: string;
        completedAt: Date;
    },
    labels: ShareTitleLabels,
): string {
    switch (input.mode) {
        case 'daily':
            return labels.titleDaily.replace(
                '{date}',
                MOSCOW_DAY_MONTH.format(input.completedAt),
            );
        case 'blitz':
            return labels.titleBlitz.replace('{difficulty}', input.difficultyLabel);
        case 'survival':
            return labels.titleSurvival.replace('{difficulty}', input.difficultyLabel);
        case 'classic':
            return labels.titleClassic.replace('{difficulty}', input.difficultyLabel);
    }
}

export type ShareTargets = {
    telegram: string;
    vk: string;
    max: string;
};

export function buildShareTargets(share: ResultShare): ShareTargets {
    const url = encodeURIComponent(share.url);

    return {
        telegram: `https://t.me/share/url?url=${url}&text=${encodeURIComponent(share.textWithoutUrl)}`,
        vk: `https://vk.com/share.php?url=${url}&title=${encodeURIComponent(share.title)}`,
        max: `https://max.ru/:share?text=${encodeURIComponent(share.text)}`,
    };
}
