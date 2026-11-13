/**
 * Разбор и проверка маячка воронки на сервере (`POST /api/e`). Чистые
 * функции без БД и без Next — их проверяют unit-тесты.
 *
 * Браузеру не доверяем: имя события — только из списка, свойства — строго
 * по схеме события (лишние ключи отбрасываются), строки — короткие.
 * Серверные события (`signup`) отсюда прислать нельзя. Устройство и страну
 * определяет сервер по заголовкам и сохраняет только класс / 2 буквы, сами
 * заголовки не хранятся.
 *
 * Canon: docs/DECISIONS.md → Funnel analytics: own events + existing tables.
 */

import { z } from 'zod';

import {
    ANALYTICS_MAX_BATCH,
    ANALYTICS_MODES,
    ANALYTICS_ROUTES,
    ANALYTICS_VISIT_ID_PATTERN,
    type AnalyticsClientEvent,
} from '@/shared/analytics/events';

/** Тело маячка больше этого — не наш клиент. */
export const ANALYTICS_MAX_BODY_BYTES = 4096;

const routeSchema = z.enum(ANALYTICS_ROUTES);
const shortToken = z
    .string()
    .max(64)
    .regex(/^[a-z0-9._-]+$/);
const emptyProps = z.object({}).strip();

const clientEventSchema = z.discriminatedUnion('n', [
    z.object({
        n: z.literal('visit'),
        p: z
            .object({
                route: routeSchema,
                referrerHost: shortToken.nullable(),
                ref: shortToken.max(32).nullable(),
            })
            .strip(),
    }),
    z.object({
        n: z.literal('page_view'),
        p: z.object({ route: routeSchema }).strip(),
    }),
    z.object({ n: z.literal('demo_answer'), p: emptyProps.default({}) }),
    z.object({
        n: z.literal('mode_open'),
        p: z.object({ mode: z.enum(ANALYTICS_MODES) }).strip(),
    }),
    z.object({ n: z.literal('share_click'), p: emptyProps.default({}) }),
]);

const beaconSchema = z.object({
    v: z.string().regex(ANALYTICS_VISIT_ID_PATTERN),
    e: z.array(z.unknown()).min(1).max(ANALYTICS_MAX_BATCH),
});

export type ParsedBeacon = {
    visitId: string;
    events: AnalyticsClientEvent[];
};

/**
 * Тело маячка → visitId и проверенные события. Битое событие пропускаем, а не
 * роняем всю пачку: старая вкладка после деплоя может прислать устаревшее.
 * `null` — тело целиком не наше (нет visitId, не массив, слишком много).
 */
export function parseBeaconBody(raw: unknown): ParsedBeacon | null {
    const body = beaconSchema.safeParse(raw);
    if (!body.success) {
        return null;
    }

    const events: AnalyticsClientEvent[] = [];
    for (const item of body.data.e) {
        const parsed = clientEventSchema.safeParse(item);
        if (parsed.success) {
            events.push({
                name: parsed.data.n,
                props: parsed.data.p,
            } as AnalyticsClientEvent);
        }
    }

    return { visitId: body.data.v, events };
}

/**
 * Боты, превью ссылок, headless-браузеры (в т. ч. прод-smoke Playwright).
 * Маячок и так требует JS — это второй фильтр.
 *
 * Не добавлять сюда «telegram» / «yandex»: встроенный браузер Telegram
 * пишет `Telegram-Android` в UA, а это живые игроки из главного канала.
 * Боты этих сервисов называют себя `…Bot` и отсекаются по `bot`.
 */
const BOT_UA =
    /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|vkshare|phantom|puppeteer|playwright|selenium/i;

/** Все настоящие браузеры начинают UA с `Mozilla/`; curl, python, превью WhatsApp — нет. */
const BROWSER_UA = /^Mozilla\//;

export function isBotUserAgent(userAgent: string | null): boolean {
    if (!userAgent || !BROWSER_UA.test(userAgent.trim())) {
        return true;
    }
    return BOT_UA.test(userAgent);
}

export type DeviceClass = 'mobile' | 'desktop';

/** Только класс устройства: сам User-Agent не храним. */
export function deviceClassOf(userAgent: string | null): DeviceClass {
    return userAgent && /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)
        ? 'mobile'
        : 'desktop';
}

/** `x-vercel-ip-country` → две заглавные буквы или null (dev, мусор). */
export function countryOf(header: string | null): string | null {
    const code = header?.trim().toUpperCase();
    return code && /^[A-Z]{2}$/.test(code) ? code : null;
}

export type AnalyticsEventRow = {
    name: string;
    visitId: string;
    userId: string | null;
    props: Record<string, unknown>;
};

/**
 * Проверенные события + серверные поля → строки для INSERT. Устройство и
 * страна ложатся в props каждого события: отчёт группирует без JOIN.
 */
export function toEventRows(input: {
    beacon: ParsedBeacon;
    userId: string | null;
    device: DeviceClass;
    country: string | null;
}): AnalyticsEventRow[] {
    const { beacon, userId, device, country } = input;
    return beacon.events.map((event) => ({
        name: event.name,
        visitId: beacon.visitId,
        userId,
        props: { ...event.props, device, country },
    }));
}
