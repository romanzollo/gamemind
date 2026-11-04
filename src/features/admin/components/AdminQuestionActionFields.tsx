'use client';

/**
 * Скрытые поля форм действий над одним вопросом в списке
 * (locale + questionId + query списка для возврата на место).
 *
 * Query списка (`back`) приходит контекстом от AdminQuestionsTable, чтобы не
 * тянуть prop через каждую кнопку строки. Сервер всё равно перепроверяет его
 * (admin-question-list-back) — значение из формы ему не доверяется.
 */

import { createContext, useContext } from 'react';

import { ADMIN_QUESTION_LIST_BACK_PARAM } from '@/features/admin/lib/admin-question-list-back';
import type { Locale } from '@/shared/i18n';

/** Нормализованный query текущего списка; '' — список по умолчанию. */
export const AdminQuestionListBackContext = createContext('');

export function useAdminQuestionListBack(): string {
    return useContext(AdminQuestionListBackContext);
}

export function AdminQuestionActionFields({
    locale,
    questionId,
}: {
    locale: Locale;
    questionId: string;
}) {
    const back = useAdminQuestionListBack();

    return (
        <>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="questionId" value={questionId} />
            {back ? (
                <input
                    type="hidden"
                    name={ADMIN_QUESTION_LIST_BACK_PARAM}
                    value={back}
                />
            ) : null}
        </>
    );
}
