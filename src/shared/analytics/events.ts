/**
 * Контракт событий воронки (ROADMAP 3.5): какие события бывают, какие у них
 * свойства, как из адреса страницы получить маршрут-шаблон.
 *
 * Общий для клиента (`track.ts`) и сервера (`/api/e`). Здесь нет Zod и
 * ничего серверного — модуль попадает в клиентский бандл, поэтому он
 * маленький и чистый.
 *
 * Что сознательно не собираем: IP, строку User-Agent, полный URL (только
 * шаблон маршрута без id), полный адрес источника (только хост).
 * Путь от старта игры (старт, ответы, результат, вызов другу) — не события:
 * он уже лежит в QuizSession / QuizAnswer / QuizResult / FriendChallenge.
 *
 * Canon: docs/DECISIONS.md → Funnel analytics: own events + existing tables.
 */

/** Режимы со шторкой настроек на главной. */
export const ANALYTICS_MODES = ['classic', 'blitz', 'survival'] as const;
export type AnalyticsMode = (typeof ANALYTICS_MODES)[number];

/**
 * Маршруты, которые считаем. Страница игры `/quiz/[id]` и админка сюда не
 * входят никогда: на горячем пути квиза маячка нет.
 */
export const ANALYTICS_ROUTES = [
    '/',
    '/login',
    '/register',
    '/challenge/[id]',
    '/result/[id]',
    '/leaderboard',
    '/profile',
    '/rights',
    '/privacy',
] as const;
export type AnalyticsRoute = (typeof ANALYTICS_ROUTES)[number];

/** Чем делятся: результатом партии или ссылкой «Вызова другу». */
export const ANALYTICS_SHARE_WHAT = ['result', 'challenge'] as const;
export type AnalyticsShareWhat = (typeof ANALYTICS_SHARE_WHAT)[number];

/** Куда: кнопка (системное меню / буфер) или прямая ссылка мессенджера. */
export const ANALYTICS_SHARE_VIA = ['button', 'telegram', 'vk', 'max'] as const;
export type AnalyticsShareVia = (typeof ANALYTICS_SHARE_VIA)[number];

/** Событие, которое может прислать браузер. */
export type AnalyticsClientEvent =
    | {
          /** Первая страница вкладки: откуда пришёл человек. */
          name: 'visit';
          props: {
              route: AnalyticsRoute;
              /** Хост сайта-источника, без пути; null — прямой заход или свой сайт. */
              referrerHost: string | null;
              /** `?ref=` или `?utm_source=` после очистки; null — нет. */
              ref: string | null;
          };
      }
    | { name: 'page_view'; props: { route: AnalyticsRoute } }
    /** Посетитель ответил на демо-вопрос во вступлении главной. */
    | { name: 'demo_answer'; props: Record<string, never> }
    /** Открыл шторку режима на главной. */
    | { name: 'mode_open'; props: { mode: AnalyticsMode } }
    /** Нажал «Поделиться» (кнопка или ссылка мессенджера). */
    | {
          name: 'share_click';
          props: { what: AnalyticsShareWhat; via: AnalyticsShareVia };
      };

export type AnalyticsClientEventName = AnalyticsClientEvent['name'];

export const ANALYTICS_CLIENT_EVENT_NAMES = [
    'visit',
    'page_view',
    'demo_answer',
    'mode_open',
    'share_click',
] as const satisfies readonly AnalyticsClientEventName[];

/** Как человек вошёл в аккаунт. */
export type AnalyticsAuthMethod = 'password' | 'yandex' | 'vk';

/**
 * События, которые пишет только сервер (браузер их прислать не может):
 * - `signup` — создан новый аккаунт (`wasGuest` — из гостя, игры остались);
 * - `guest_merged` — гость вошёл в уже существующий аккаунт, его игры
 *   перенесены туда (сам гость удалён).
 */
export type AnalyticsServerEvent =
    | {
          name: 'signup';
          props: { method: AnalyticsAuthMethod; wasGuest: boolean };
      }
    | { name: 'guest_merged'; props: { method: AnalyticsAuthMethod } };

export type AnalyticsServerEventName = AnalyticsServerEvent['name'];

/** visitId серверных событий: браузерный id визита серверу неизвестен. */
export const ANALYTICS_SERVER_VISIT_ID = 'server';

export type AnalyticsEventName =
    | AnalyticsClientEventName
    | AnalyticsServerEventName;

/** Потолок событий в одной пачке маячка (и на клиенте, и на сервере). */
export const ANALYTICS_MAX_BATCH = 20;

/** Формат тела `POST /api/e`: короткие ключи — маячок шлёт часто. */
export type AnalyticsBeaconBody = {
    /** visitId */
    v: string;
    /** события */
    e: Array<{ n: string; p?: Record<string, unknown> }>;
};

const LOCALE_PREFIX = /^\/(ru|en)(?=\/|$)/;

/**
 * Адрес страницы → шаблон маршрута из списка. `null` — не считаем
 * (страница игры, админка, неизвестный адрес).
 */
export function toAnalyticsRoute(pathname: string): AnalyticsRoute | null {
    const path = pathname.replace(LOCALE_PREFIX, '').replace(/\/+$/, '') || '/';
    const [first, second, ...rest] = path.split('/').filter(Boolean);

    if (!first) {
        return '/';
    }

    if (first === 'challenge' || first === 'result') {
        return second && rest.length === 0
            ? (`/${first}/[id]` as AnalyticsRoute)
            : null;
    }

    if (second) {
        return null;
    }

    const route = `/${first}`;
    return (ANALYTICS_ROUTES as readonly string[]).includes(route)
        ? (route as AnalyticsRoute)
        : null;
}

const REF_ALLOWED = /[^a-z0-9_-]/g;
const REF_MAX = 32;

/** `?ref=` / `utm_source` → строчные `[a-z0-9_-]`, не длиннее 32; пусто → null. */
export function sanitizeRef(raw: string | null | undefined): string | null {
    if (!raw) {
        return null;
    }
    const cleaned = raw.trim().toLowerCase().replace(REF_ALLOWED, '').slice(0, REF_MAX);
    return cleaned || null;
}

const HOST_PATTERN = /^[a-z0-9.-]{1,64}$/;

/**
 * Хост источника без `www.`; свой сайт и мусор → null. Путь и параметры
 * адреса источника не храним: там бывают поисковые запросы и токены.
 */
export function referrerHostOf(
    referrer: string | null | undefined,
    ownHost: string,
): string | null {
    if (!referrer) {
        return null;
    }
    let host: string;
    try {
        host = new URL(referrer).hostname.toLowerCase();
    } catch {
        return null;
    }
    const bare = host.replace(/^www\./, '');
    if (!HOST_PATTERN.test(bare)) {
        return null;
    }
    return bare === ownHost.toLowerCase().replace(/^www\./, '') ? null : bare;
}

/** Ключ в `localStorage`: браузер владельца/админа — маячок молчит. */
export const ANALYTICS_OPT_OUT_KEY = 'gm_no_analytics';

/** Ключ в `sessionStorage`: id визита этой вкладки. */
export const ANALYTICS_VISIT_KEY = 'gm_visit';

/** visitId: случайный, base64url-подобный, 8–40 символов. */
export const ANALYTICS_VISIT_ID_PATTERN = /^[A-Za-z0-9_-]{8,40}$/;
