/**
 * Next.js instrumentation — side-effects при старте Node runtime.
 *
 * Dev-only: периодический SELECT 1 будит Neon (free tier sleep ~5 мин),
 * чтобы первый /admin/questions не платил cold start ~10–15s.
 * Идёт через ту же очередь, что admin list — без параллельного TLS.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }

    if (process.env.NODE_ENV !== 'development') {
        return;
    }

    const { warmAdminListConnection } = await import(
        '@/entities/question/question.repository'
    );

    // Neon free обычно засыпает ~5 мин без трафика.
    const WARM_INTERVAL_MS = 4 * 60 * 1000;

    const tick = () => {
        void warmAdminListConnection().catch((error: unknown) => {
            console.warn(
                '[admin-db-warm] ping failed:',
                error instanceof Error ? error.message : error,
            );
        });
    };

    tick();
    setInterval(tick, WARM_INTERVAL_MS);
}
