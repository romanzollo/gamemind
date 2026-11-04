/**
 * Можно ли отдать картинку-подсказку через ужатие next/image.
 *
 * Только свои пути без query: `/quiz-images/…` (public, имя = хеш) и
 * `/media/…` (загрузки админки, rewrite в Blob). Должно совпадать с
 * `images.localPatterns` в next.config.ts: путь вне allowlist next/image
 * в dev роняет рендер, на проде отвечает 400. SVG — как есть (векторную
 * картинку ужимать незачем).
 */
const OPTIMIZABLE_PROMPT_SRC = /^\/(?:quiz-images|media)\/[^?#]+$/;

export function canOptimizePromptImage(src: string): boolean {
    return OPTIMIZABLE_PROMPT_SRC.test(src) && !src.toLowerCase().endsWith('.svg');
}
