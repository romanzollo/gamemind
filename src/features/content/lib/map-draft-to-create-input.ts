/**
 * Маппинг draft JSON → CreateQuestionInput (admin create shape).
 *
 * Зачем отдельный pure-модуль: CLI/import и тесты делят одну форму,
 * без знания о Neon. order = 0..n как в admin form parseOptionsFromFormData.
 * id не задаём — createWithOptions сгенерирует UUID (безопаснее, чем
 * upsert по draftKey: ON CONFLICT не сбрасывает publicationStatus).
 *
 * metadata из draft пока не пишем: admin create SQL тоже не пишет metadata.
 * См. docs/CONTENT_PIPELINE.md.
 */

import type { CreateQuestionInput } from '@/features/admin/lib/validation';

import type { DraftQuestion } from './draft-questions.schema';

export function mapDraftQuestionToCreateInput(
    question: DraftQuestion,
): CreateQuestionInput {
    return {
        type: 'TEXT',
        difficulty: question.difficulty,
        category: question.category ?? 'video-games',
        translations: {
            ru: { text: question.translations.ru.text },
            en: { text: question.translations.en.text },
        },
        options: question.options.map((option, index) => ({
            isCorrect: option.isCorrect,
            order: index,
            translations: {
                ru: { text: option.translations.ru.text },
                en: { text: option.translations.en.text },
            },
        })),
    };
}
