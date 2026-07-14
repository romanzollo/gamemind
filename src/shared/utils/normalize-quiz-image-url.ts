/**
 * Snapshot may freeze an old placeholder URL (`.svg`) after we switched seed assets to `.webp`.
 * Map known local quiz-image placeholders so refresh / in-progress sessions keep working.
 */
export function normalizeQuizImageUrl(
    url: string | null | undefined,
): string | null {
    if (!url) {
        return null;
    }

    const trimmed = url.trim();
    if (!trimmed) {
        return null;
    }

    if (
        trimmed.startsWith('/quiz-images/') &&
        trimmed.toLowerCase().endsWith('.svg')
    ) {
        return `${trimmed.slice(0, -4)}.webp`;
    }

    return trimmed;
}
