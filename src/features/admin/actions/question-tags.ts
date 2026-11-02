'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { questionTagsRepository } from '@/entities/question/question-tags.repository';
import { ADMIN_TAG_ID_PATTERN } from '@/features/admin/lib/parse-admin-question-list-filters';
import { requireAdmin } from '@/lib/auth/guards';
import { captureAppError } from '@/lib/monitoring/capture-app-error';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

/**
 * Метки вопроса в админке: добавить / убрать одну связь QuestionTag.
 * Справочник меток не меняется — его пишет `taxonomy:sync` из каталога.
 * Права — на сервере (requireAdmin); id метки — только формата каталога.
 */

export type AdminQuestionTagsState = {
    errorCode: 'UNKNOWN_TAG' | 'SAVE_FAILED' | null;
};

const tagMutationSchema = z.object({
    intent: z.enum(['add', 'remove']),
    questionId: z.string().trim().min(1).max(100),
    tagId: z.string().regex(ADMIN_TAG_ID_PATTERN),
});

function getLocale(formData: FormData): Locale {
    const locale = formData.get('locale');
    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

export async function mutateQuestionTagAction(
    _prevState: AdminQuestionTagsState,
    formData: FormData,
): Promise<AdminQuestionTagsState> {
    const locale = getLocale(formData);
    await requireAdmin(locale);

    const parsed = tagMutationSchema.safeParse({
        intent: formData.get('intent'),
        questionId: formData.get('questionId'),
        tagId: formData.get('tagId'),
    });
    // Пустой или чужой id — это текст, которого нет в подсказках каталога.
    if (!parsed.success) {
        return { errorCode: 'UNKNOWN_TAG' };
    }

    const { intent, questionId, tagId } = parsed.data;
    try {
        if (intent === 'add') {
            const result = await questionTagsRepository.addTag(
                questionId,
                tagId,
            );
            if (!result.ok) {
                return {
                    errorCode:
                        result.reason === 'UNKNOWN_TAG'
                            ? 'UNKNOWN_TAG'
                            : 'SAVE_FAILED',
                };
            }
        } else {
            await questionTagsRepository.removeTag(questionId, tagId);
        }
    } catch (error) {
        console.error('mutateQuestionTagAction failed:', error);
        captureAppError(error, {
            area: 'admin-question',
            extra: { action: `tag-${intent}` },
        });
        return { errorCode: 'SAVE_FAILED' };
    }

    revalidatePath(`/${locale}/admin/questions/${questionId}/edit`);
    revalidatePath(`/${locale}/admin/questions`);
    return { errorCode: null };
}
