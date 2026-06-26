import { getDictionary, isLocale } from '@/shared/i18n';

type HomePageProps = {
    params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: HomePageProps) {
    const { locale } = await params;
    const dictionary = getDictionary(isLocale(locale) ? locale : 'ru');

    return (
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 p-8">
            <h1 className="text-3xl font-semibold">{dictionary.home.title}</h1>
            <p className="text-neutral-600 dark:text-neutral-400">
                {dictionary.home.description}
            </p>
        </main>
    );
}
