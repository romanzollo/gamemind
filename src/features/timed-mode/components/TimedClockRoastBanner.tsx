/**
 * Баннер «часы победили» на result после Timed auto-submit.
 *
 * Scoreboard Editorial: не плоский InlineAlert, а plaque с eyebrow + title.
 * Presentation only — query `?clock=1` уже проверен на page.
 */

type TimedClockRoastBannerProps = {
    eyebrow: string;
    title: string;
    body: string;
};

export function TimedClockRoastBanner({
    eyebrow,
    title,
    body,
}: TimedClockRoastBannerProps) {
    return (
        <aside
            className="mb-4 rounded-lg border border-border border-l-4 border-l-warning bg-surface p-4 shadow-sm sm:mb-5 sm:p-5"
            role="status"
            aria-labelledby="timed-clock-roast-title"
        >
            <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-warning">
                {eyebrow}
            </p>
            <h2
                id="timed-clock-roast-title"
                className="mt-1 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl"
            >
                {title}
            </h2>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted sm:text-base">
                {body}
            </p>
        </aside>
    );
}
