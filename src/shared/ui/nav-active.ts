import { removeLocaleFromPathname } from '@/shared/i18n';

/**
 * Сравнивает текущий pathname с href пункта nav (без локали).
 * Home — только exact; /admin — hub и вложенные; остальное — exact или nested.
 */
export function isNavActive(pathname: string, href: string): boolean {
    const current = removeLocaleFromPathname(pathname);

    if (href === '/') {
        return current === '/';
    }

    // Admin: подсвечивать и /admin, и /admin/questions|users|...
    if (href === '/admin') {
        return current === '/admin' || current.startsWith('/admin/');
    }

    return current === href || current.startsWith(`${href}/`);
}

/** Классы активного пункта — Scoreboard Editorial, без новых цветов. */
export function navActiveClassName(active: boolean, base: string): string {
    if (!active) {
        return base;
    }

    return `${base} bg-surface-muted font-medium text-foreground`;
}
