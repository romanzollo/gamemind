/**
 * Next.js instrumentation — side-effects при старте Node runtime.
 *
 * Раньше здесь был периодический warmAdminListConnection (каждые 4 мин).
 * Он шёл через ту же Direct-очередь, что quiz start/pick. На больном Neon
 * зависший ping на 12–50с блокировал Classic/Blitz и выглядел как «всё встало».
 * Warm с admin hub (явный ping) остаётся; фоновый interval выключен.
 *
 * См. DECISIONS.md → Quiz Start Playbook: не занимать Direct queue warm’ом.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }

    // Dev keep-warm interval отключён — конкурировал с quiz Direct path.
}
