/**
 * router.refresh() с явным сохранением window.scrollY.
 *
 * Next обычно мержит RSC без сброса scroll, но крупные remount
 * (form key, layout session) иногда съезжают — возвращаем Y после кадра.
 */

type RefreshableRouter = {
    refresh: () => void;
};

export function refreshPreservingScroll(router: RefreshableRouter): void {
    if (typeof window === 'undefined') {
        router.refresh();
        return;
    }

    const y = window.scrollY;
    router.refresh();

    requestAnimationFrame(() => {
        window.scrollTo(0, y);
        requestAnimationFrame(() => {
            window.scrollTo(0, y);
        });
    });
}
