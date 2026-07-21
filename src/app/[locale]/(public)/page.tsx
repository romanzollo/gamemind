import { getDictionary, isLocale } from '@/shared/i18n';
import { PendingLink } from '@/shared/ui';

type HomePageProps = {
    params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: HomePageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    return (
        <main className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-background">
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-10%,var(--surface-muted)_0%,transparent_55%)]"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(to_top,var(--surface-muted)_0%,transparent_100%)] opacity-60"
            />

            <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16 sm:px-8">
                <p className="font-display text-6xl font-semibold tracking-tight text-foreground sm:text-7xl md:text-8xl">
                    {dictionary.home.title}
                </p>

                <h1 className="mt-6 max-w-xl text-balance text-xl font-medium leading-snug text-foreground sm:text-2xl">
                    {dictionary.home.headline}
                </h1>

                <p className="mt-4 max-w-lg text-pretty text-base leading-relaxed text-muted sm:text-lg">
                    {dictionary.home.description}
                </p>

                <div className="mt-10">
                    <PendingLink
                        href={`/${safeLocale}/quiz`}
                        className="min-h-11 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground motion-safe:transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                        {dictionary.home.cta}
                    </PendingLink>
                </div>
            </div>
        </main>
    );
}
