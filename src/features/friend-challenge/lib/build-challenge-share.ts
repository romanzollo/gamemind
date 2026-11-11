/**
 * Текст и ссылки «Вызова другу» для мессенджеров (pure).
 *
 * Короткие строки вместо абзаца: кто вызывает, набор, счёт с квадратиками,
 * призыв. Жирный шрифт в тексте ссылки «поделиться» мессенджеры не
 * принимают — жирным Telegram показывает `og:title` превью страницы вызова.
 * Эмодзи — только в тексте, который уходит в мессенджер (docs/DESIGN.md).
 * Ссылки Telegram / VK / MAX — те же, что у «Поделиться результатом».
 * ADR: docs/DECISIONS.md → Friend challenge, Share result.
 */

import {
    buildShareTargets,
    SQUARE_EMOJI,
    type ResultShare,
    type ShareTargets,
} from '@/features/quiz/lib/build-result-share';

const CHALLENGE_MARK = '⚔️';

export type ChallengeShareLabels = {
    /** `Вызов от {name}` */
    header: string;
    /** `Счёт: {score}` */
    scoreLine: string;
    invite: string;
    /** `{name} бросает вызов: {score}` — заголовок для VK и превью. */
    title: string;
};

export type ChallengeShareInput = {
    creatorName: string;
    /** «Классика · Легко · 3 вопроса» — уже собрано на сервере. */
    setLine: string;
    /** «2 / 3» — очки из максимума. */
    score: string;
    marks: readonly boolean[];
    url: string;
};

export type ChallengeShare = ResultShare & { targets: ShareTargets };

export function buildChallengeShare(
    input: ChallengeShareInput,
    labels: ChallengeShareLabels,
): ChallengeShare {
    const squares = input.marks
        .map((isCorrect) => SQUARE_EMOJI[isCorrect ? 'correct' : 'wrong'])
        .join('');
    const scoreLine = labels.scoreLine.replace('{score}', input.score);

    const textWithoutUrl = [
        `${CHALLENGE_MARK} ${labels.header.replace('{name}', input.creatorName)}`,
        input.setLine,
        squares ? `${scoreLine}  ${squares}` : scoreLine,
        labels.invite,
    ].join('\n');

    const share: ResultShare = {
        title: labels.title
            .replace('{name}', input.creatorName)
            .replace('{score}', input.score),
        text: `${textWithoutUrl}\n${input.url}`,
        textWithoutUrl,
        url: input.url,
    };

    return { ...share, targets: buildShareTargets(share) };
}
