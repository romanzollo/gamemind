/**
 * Flash-query `?notice=` для admin success toasts после redirect.
 *
 * Allowlist — чужой query не мапится в toast. Display-only; мутации уже
 * завершены на сервере до redirect.
 *
 * Canon: DECISIONS → Toast Notifications MVP (“How to add”).
 */

export const ADMIN_NOTICE_CODES = [
    'question_saved',
    'bulk_deactivated',
    'bulk_activated',
    'bulk_submitted',
    'bulk_published',
] as const;

export type AdminNoticeCode = (typeof ADMIN_NOTICE_CODES)[number];

const NOTICE_SET: ReadonlySet<string> = new Set(ADMIN_NOTICE_CODES);

export function isAdminNoticeCode(value: string): value is AdminNoticeCode {
    return NOTICE_SET.has(value);
}

export function parseAdminNotice(
    raw: string | string[] | undefined,
): AdminNoticeCode | null {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }

    const code = value.trim();
    return isAdminNoticeCode(code) ? code : null;
}

/** `path` без hash; notice добавляется/заменяет query param. */
export function appendAdminNotice(
    path: string,
    notice: AdminNoticeCode,
): string {
    const [pathname, query = ''] = path.split('?');
    const params = new URLSearchParams(query);
    params.delete('error');
    params.set('notice', notice);
    const next = params.toString();
    return next ? `${pathname}?${next}` : `${pathname}?notice=${notice}`;
}
