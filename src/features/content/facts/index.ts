/**
 * Факты «А ты знал?»: контракт партии, проверка, поиск подсказок ответа.
 * Без Prisma / pg / fs — CLI `scripts/trivia-facts.ts` читает файлы и БД сам.
 */

export {
    TRIVIA_FACTS_BATCH_MAX,
    TRIVIA_FACT_FACETS,
    TRIVIA_FACT_MAX_LENGTH,
    TRIVIA_FACT_MIN_LENGTH,
    draftFactSchema,
    draftFactsBatchSchema,
    triviaFactKeySchema,
    triviaFactTagRefSchema,
    type DraftFact,
    type DraftFactsBatch,
    type TriviaFactFacet,
} from './draft-facts.schema';

export {
    validateDraftFactsBatch,
    type DraftFactsIssue,
    type DraftFactsValidationResult,
    type DraftFactsWarning,
    type ResolvedDraftFact,
} from './validate-draft-facts';

export {
    findFactAnswerHints,
    normalizeForHint,
    type FactAnswerHint,
    type FactHintQuestion,
} from './find-fact-answer-hints';
