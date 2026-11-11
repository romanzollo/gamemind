/**
 * «Правообладателям» — куда писать, чтобы убрать музыку или кадр.
 *
 * Статичная страница без БД. Обещание «уберём за 3 рабочих дня» держится
 * порядком снятия из docs/DECISIONS.md → AUDIO_GUESS → Rights and takedown.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CopyEmailButton } from '@/features/rights/components/CopyEmailButton';
import { RIGHTS_EMAIL } from '@/shared/config/site';
import { getDictionary, isLocale, locales } from '@/shared/i18n';
import { buttonClassName } from '@/shared/ui';

type RightsPageProps = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({
    params,
}: RightsPageProps): Promise<Metadata> {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';

    return {
        title: getDictionary(safeLocale).rights.pageTitle,
        alternates: {
            canonical: `/${safeLocale}/rights`,
            languages: Object.fromEntries(
                locales.map((other) => [other, `/${other}/rights`]),
            ),
        },
    };
}

export default async function RightsPage({ params }: RightsPageProps) {
    const { locale } = await params;
    if (!isLocale(locale)) {
        notFound();
    }
    const dictionary = getDictionary(locale);
    const labels = dictionary.rights;

    return (
        <main className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-10">
            <p className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted">
                {labels.eyebrow}
            </p>
            <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                {labels.title}
            </h1>

            <section className="mt-5 rounded-lg border border-border bg-surface p-4 text-sm leading-relaxed shadow-sm sm:p-6 sm:text-base">
                <p>{labels.intro}</p>
                <p className="mt-3">{labels.request}</p>
                <p className="mt-3 text-sm text-muted">{labels.hint}</p>
            </section>

            <div className="mt-4 flex gap-2">
                <a
                    href={`mailto:${RIGHTS_EMAIL}`}
                    className={buttonClassName({ className: 'min-w-0 flex-1 break-all sm:flex-none' })}
                >
                    {RIGHTS_EMAIL}
                </a>
                <CopyEmailButton
                    email={RIGHTS_EMAIL}
                    labels={{
                        copyLabel: labels.copyLabel,
                        copied: labels.copied,
                        copyFailed: dictionary.share.copyFailed,
                    }}
                />
            </div>
        </main>
    );
}
