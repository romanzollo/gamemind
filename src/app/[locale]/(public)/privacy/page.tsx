/**
 * «Что мы собираем» — какие данные хранит GameMind и зачем (ROADMAP 3.5d).
 *
 * Статичная страница без БД, по образцу «Правообладателям». Это честное
 * объяснение для игроков, а не юридическая политика по 152-ФЗ: та требует
 * данных оператора и отдельного согласия — отдельная задача.
 * Текст обязан совпадать с тем, что делает код: при изменении сбора данных
 * (docs/DECISIONS.md → Funnel analytics, Error monitoring) — правим и его.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CopyEmailButton } from '@/features/rights/components/CopyEmailButton';
import { RIGHTS_EMAIL } from '@/shared/config/site';
import { getDictionary, isLocale, locales } from '@/shared/i18n';
import { buttonClassName } from '@/shared/ui';

type PrivacyPageProps = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({
    params,
}: PrivacyPageProps): Promise<Metadata> {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';

    return {
        title: getDictionary(safeLocale).privacy.pageTitle,
        alternates: {
            canonical: `/${safeLocale}/privacy`,
            languages: Object.fromEntries(
                locales.map((other) => [other, `/${other}/privacy`]),
            ),
        },
    };
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
    const { locale } = await params;
    if (!isLocale(locale)) {
        notFound();
    }
    const dictionary = getDictionary(locale);
    const labels = dictionary.privacy;

    return (
        <main className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-10">
            <p className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted">
                {labels.eyebrow}
            </p>
            <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                {labels.title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
                {labels.intro}
            </p>

            <section className="mt-5 divide-y divide-border rounded-lg border border-border bg-surface px-4 shadow-sm sm:px-6">
                {labels.sections.map((section) => (
                    <div key={section.title} className="py-4 sm:py-5">
                        <h2 className="font-display text-lg font-semibold tracking-tight">
                            {section.title}
                        </h2>
                        <p className="mt-1.5 text-sm leading-relaxed sm:text-base">
                            {section.text}
                        </p>
                    </div>
                ))}
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
                        copyLabel: dictionary.rights.copyLabel,
                        copied: dictionary.rights.copied,
                        copyFailed: dictionary.share.copyFailed,
                    }}
                />
            </div>
        </main>
    );
}
