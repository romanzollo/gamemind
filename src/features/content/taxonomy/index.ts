/**
 * Таксономия контента: схема каталога, вывод меток, ключ контента.
 * Без Prisma/pg; загрузка с диска — отдельно (`load-taxonomy-files.ts`).
 */

export {
    GAME_FACET_SLUGS,
    normalizeCatalogName,
    questionOverridesSchema,
    tagRefSchema,
    taxonomyCatalogSchema,
    type CatalogGame,
    type GameFacetSlug,
    type QuestionOverrides,
    type TagRef,
    type TaxonomyCatalog,
} from './taxonomy-catalog.schema';

export {
    buildTaxonomyIndex,
    deriveQuestionTags,
    expandTagRefs,
    refForGameName,
    tagIdOf,
    type FacetRow,
    type QuestionTagInput,
    type QuestionTagResult,
    type QuestionTagSource,
    type TagRow,
    type TaxonomyIndex,
} from './taxonomy-index';

export {
    planTaxonomySync,
    type ExistingTagRow,
    type SyncDraftQuestion,
    type SyncQuestionRow,
    type TaxonomySyncInput,
    type TaxonomySyncPlan,
} from './plan-taxonomy-sync';

export {
    buildDraftTextIndex,
    isRandomQuestionId,
    normalizeQuestionText,
    resolveContentKey,
    type ContentKeyQuestion,
    type ContentKeySource,
    type DraftTextIndex,
} from './content-key';
