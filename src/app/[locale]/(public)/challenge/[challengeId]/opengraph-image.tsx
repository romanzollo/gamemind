/**
 * Превью ссылки «Вызова другу» (Open Graph) для Telegram, VK, MAX.
 *
 * Крупно: метка «Вызов», ник автора, его счёт и ✓/✗ по вопросам, набор и
 * призыв. Рендерится на запрос (данные из БД — одна строка вызова), шрифты
 * те же, что у общего превью (`[locale]/opengraph-image.tsx`, пути — в
 * outputFileTracingIncludes). Ник — только латиница (правило имени), поэтому
 * Oswald; русский текст — Plex. Цвета — тёмная тема строками.
 * Вызова нет / база не ответила — нейтральная карточка GameMind.
 * ADR: docs/DECISIONS.md → Friend challenge.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import {
    friendChallengeRepository,
    isFriendChallengeId,
} from '@/entities/friend-challenge/friend-challenge.repository';
import {
    buildChallengeSetLine,
    formatChallengeScore,
} from '@/features/friend-challenge/lib/challenge-labels';
import {
    getChallengeMaxScore,
    getChallengeSetupDifficulty,
} from '@/features/friend-challenge/lib/challenge-rules';
import { getDictionary, isLocale } from '@/shared/i18n';
import { OgAnswerGridMark } from '@/shared/ui/og-answer-grid-mark';

export const alt = 'GameMind';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const COLORS = {
    background: '#16191f',
    foreground: '#e8ecf1',
    muted: '#a3acb8',
    primary: '#3ecf8e',
    success: '#62d390',
    danger: '#f47e84',
};

export default async function ChallengeOpenGraphImage({
    params,
}: {
    params: Promise<{ locale: string; challengeId: string }>;
}) {
    const { locale: rawLocale, challengeId } = await params;
    const locale = isLocale(rawLocale) ? rawLocale : 'ru';
    const dictionary = getDictionary(locale);
    const labels = dictionary.friendChallenge;

    const [challenge, oswaldLatin, plexLatin, plexCyrillic] = await Promise.all([
        isFriendChallengeId(challengeId)
            ? friendChallengeRepository.findById(challengeId).catch(() => null)
            : Promise.resolve(null),
        readFile(
            join(
                process.cwd(),
                'node_modules/@fontsource/oswald/files/oswald-latin-600-normal.woff',
            ),
        ),
        readFile(
            join(
                process.cwd(),
                'node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff',
            ),
        ),
        readFile(
            join(
                process.cwd(),
                'node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-cyrillic-500-normal.woff',
            ),
        ),
    ]);

    const name = challenge?.creatorUsername ?? labels.deletedPlayer;
    const score = challenge
        ? formatChallengeScore(
              challenge.creatorScore,
              getChallengeMaxScore(
                  challenge.poolKind,
                  challenge.difficulty,
                  challenge.questionCount,
              ),
          )
        : null;
    const setLine = challenge
        ? buildChallengeSetLine(
              dictionary,
              locale,
              getChallengeSetupDifficulty(challenge.poolKind, challenge.difficulty),
              challenge.questionCount,
          )
        : dictionary.home.headline;

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '64px 80px',
                    background: COLORS.background,
                    color: COLORS.foreground,
                    fontFamily: 'Plex',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <div
                        style={{
                            fontSize: 30,
                            letterSpacing: 6,
                            color: COLORS.primary,
                        }}
                    >
                        {labels.versusEyebrow.toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <OgAnswerGridMark size={44} />
                        <div style={{ fontFamily: 'Oswald', fontSize: 44 }}>GameMind</div>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div
                        style={{
                            fontFamily: 'Oswald',
                            fontSize: 112,
                            lineHeight: 1,
                            letterSpacing: -1,
                        }}
                    >
                        {name}
                    </div>
                    {score ? (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 40,
                                marginTop: 12,
                            }}
                        >
                            <div style={{ fontFamily: 'Oswald', fontSize: 132, lineHeight: 1 }}>
                                {score}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, maxWidth: 560 }}>
                                {(challenge?.creatorMarks ?? []).map((isCorrect, index) => (
                                    <div
                                        key={index}
                                        style={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: 8,
                                            background: isCorrect
                                                ? COLORS.success
                                                : COLORS.danger,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 34, color: COLORS.muted }}>{setLine}</div>
                    {challenge ? (
                        <div style={{ fontSize: 48, color: COLORS.primary }}>{labels.ogCta}</div>
                    ) : null}
                </div>
            </div>
        ),
        {
            ...size,
            fonts: [
                { name: 'Oswald', data: oswaldLatin, weight: 600, style: 'normal' },
                { name: 'Plex', data: plexLatin, weight: 500, style: 'normal' },
                { name: 'Plex', data: plexCyrillic, weight: 500, style: 'normal' },
            ],
        },
    );
}
