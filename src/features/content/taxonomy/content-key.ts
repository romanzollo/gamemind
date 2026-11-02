/**
 * Стабильный ключ контента вопроса (`Question.contentKey`).
 *
 * Зачем: импорт TEXT дал вопросам случайные UUID, и на dev и prod они разные
 * — каталог и правки не могут сослаться на вопрос по id. Ключ одинаков в
 * обеих базах: детерминированный id сида / картинок (`q-vg-easy-004`,
 * `img2-…` = draftKey), `metadata.draftKey`, либо draftKey черновика,
 * найденный по RU-тексту — напрямую или через цепочку `content/fixes`
 * (правка поменяла формулировку после импорта).
 *
 * IMAGE_GUESS по тексту не ищем: у всех картинок он один
 * («Угадай игру по изображению»).
 *
 * Canon: docs/DECISIONS.md → Content taxonomy.
 */

export type ContentKeySource = 'id' | 'metadata' | 'text' | 'fix-chain';

export type ContentKeyQuestion = {
    id: string;
    type: 'TEXT' | 'IMAGE_GUESS';
    metadataDraftKey: string | null;
    ruText: string | null;
};

export type DraftTextIndex = {
    draftKeyByText: ReadonlyMap<string, string>;
    /** Текст после правки → текст до неё. */
    previousTextByText: ReadonlyMap<string, string>;
};

type DraftBatchLike = {
    questions: ReadonlyArray<{
        draftKey?: string;
        type: string;
        translations: { ru: { text: string } };
    }>;
};

type FixFileLike = {
    fixes: ReadonlyArray<{
        matchQuestionRu?: string;
        question?: { ru?: string };
    }>;
};

/** Цепочки правок короткие; предел — защита от цикла в файлах правок. */
const MAX_FIX_CHAIN = 10;

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CUID_RE = /^c[a-z0-9]{24}$/;

/** id из импорта или админки: в другой базе у того же вопроса он другой. */
export function isRandomQuestionId(id: string): boolean {
    return UUID_RE.test(id) || CUID_RE.test(id);
}

export function normalizeQuestionText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[«»“”„]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

export function buildDraftTextIndex(
    batches: readonly DraftBatchLike[],
    fixFiles: readonly FixFileLike[],
): DraftTextIndex {
    const draftKeyByText = new Map<string, string>();
    for (const batch of batches) {
        for (const question of batch.questions) {
            if (question.type !== 'TEXT' || !question.draftKey) {
                continue;
            }
            draftKeyByText.set(
                normalizeQuestionText(question.translations.ru.text),
                question.draftKey,
            );
        }
    }

    const previousTextByText = new Map<string, string>();
    for (const file of fixFiles) {
        for (const fix of file.fixes) {
            if (fix.matchQuestionRu && fix.question?.ru) {
                previousTextByText.set(
                    normalizeQuestionText(fix.question.ru),
                    normalizeQuestionText(fix.matchQuestionRu),
                );
            }
        }
    }

    return { draftKeyByText, previousTextByText };
}

export function resolveContentKey(
    question: ContentKeyQuestion,
    drafts: DraftTextIndex,
): { key: string; source: ContentKeySource } | null {
    if (!isRandomQuestionId(question.id)) {
        return { key: question.id, source: 'id' };
    }
    if (question.metadataDraftKey) {
        return { key: question.metadataDraftKey, source: 'metadata' };
    }
    if (question.type !== 'TEXT' || !question.ruText) {
        return null;
    }

    let text = normalizeQuestionText(question.ruText);
    for (let step = 0; step <= MAX_FIX_CHAIN; step += 1) {
        const key = drafts.draftKeyByText.get(text);
        if (key) {
            return { key, source: step === 0 ? 'text' : 'fix-chain' };
        }
        const previous = drafts.previousTextByText.get(text);
        if (!previous) {
            return null;
        }
        text = previous;
    }

    return null;
}
