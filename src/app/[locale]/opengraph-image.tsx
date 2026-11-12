/**
 * Картинка-превью сайта (Open Graph) для ссылок в Telegram, VK, MAX.
 *
 * Без неё мессенджеры показывали голую ссылку. Собирается при сборке
 * для каждого языка (generateStaticParams ниже): на запросах ничего не
 * считается. Тексты — из словаря (заголовок главной и названия режимов),
 * шрифты — те же @fontsource, что и на сайте (woff: satori не читает
 * woff2): Oswald только для латинского «GameMind», остальное — Plex.
 * Файлы шрифтов дополнительно перечислены в outputFileTracingIncludes
 * (next.config.ts) — на случай рендера в функции Vercel.
 * Вложенные страницы наследуют картинку.
 * Цвета — значения тёмной темы из globals.css строками: генератор не
 * знает CSS-переменных. Сменилась палитра — обнови и здесь.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { getDictionary, isLocale, locales } from '@/shared/i18n';
import { OgAnswerGridMark } from '@/shared/ui/og-answer-grid-mark';

export const alt = 'GameMind';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
    return locales.map((locale) => ({ locale }));
}


export default async function OpenGraphImage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const dictionary = getDictionary(isLocale(locale) ? locale : 'ru');
    const modes = [
        dictionary.dailyChallenge.title,
        dictionary.quiz.classicTitle,
        dictionary.timedMode.title,
        dictionary.survivalMode.title,
    ].join('  ·  ');

    // Литеральные пути прямо в readFile: трассировка файлов видит их как
    // есть (путь через переменную тянул в функцию весь проект).
    const [oswaldLatin, plexLatin, plexCyrillic] = await Promise.all([
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

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '72px 80px',
                    background: '#16191f',
                    color: '#e8ecf1',
                    fontFamily: 'Plex',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                    <OgAnswerGridMark size={96} />
                    <div
                        style={{
                            fontFamily: 'Oswald',
                            fontSize: 112,
                            letterSpacing: -2,
                            lineHeight: 1,
                        }}
                    >
                        GameMind
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                    <div
                        style={{
                            // Plex: кириллица Oswald в satori не подхватывается.
                            fontSize: 64,
                            lineHeight: 1.15,
                            maxWidth: 960,
                        }}
                    >
                        {dictionary.home.headline}
                    </div>
                    <div style={{ fontSize: 32, color: '#a3acb8' }}>{modes}</div>
                </div>

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 28,
                        color: '#a3acb8',
                    }}
                >
                    <div>game-mind.ru</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        {['#3ecf8e', '#3ecf8e', '#f47e84', '#3ecf8e', '#3ecf8e'].map(
                            (color, index) => (
                                <div
                                    key={index}
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 8,
                                        background: color,
                                    }}
                                />
                            ),
                        )}
                    </div>
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
