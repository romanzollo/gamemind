/**
 * Admin question list / CRUD (Neon-hardened path).
 *
 * Зачем отдельный модуль (§11.7): admin list queue, list cache и bulk CTE
 * create/edit не должны смешиваться с quiz-pick hot path.
 *
 * publicationStatus — жизненный цикл контента (DRAFT / IN_REVIEW / PUBLISHED);
 * isActive — soft-hide. Create пишет DRAFT; edit content не меняет status;
 * переходы — отдельные idempotent методы. Quiz snapshot/scoring не трогаем.
 *
 * Этот файл — только фасад: реализация в question-admin-list (список,
 * кэш, dev-очередь), question-admin-write (редактор, создание, правка,
 * удаление) и question-admin-status (витрина и публикация). Сигнатуры
 * методов прежние — импорты снаружи не меняются.
 *
 * Публичный фасад: question.repository.ts реэкспортирует warmAdminListConnection
 * и склеивает методы в questionRepository.
 * См. docs/DECISIONS.md → Repository File Split + Admin List Neon Hang Mitigation.
 */

import type { Locale } from '@/shared/i18n';
import type { AdminQuestionListFilters } from '@/features/admin/lib/parse-admin-question-list-filters';
import type {
    CreateQuestionInput,
    UpdateQuestionInput,
} from '@/features/admin/lib/validation';
import type { QuestionPublicationStatus } from '@/types';
import {
    findAdminQuestionListPage,
    type AdminQuestionListPageResult,
} from '@/entities/question/question-admin-list.repository';
import {
    activateQuestionById,
    deactivateQuestionById,
    mutatePublicationStatusById,
    setManyIsActiveByIds,
    setManyPublicationStatusByIds,
} from '@/entities/question/question-admin-status.repository';
import {
    createAdminQuestion,
    deleteAdminQuestionById,
    findByIdForAdminWithDirectPg,
    updateAdminQuestion,
    type CreateQuestionOptions,
} from '@/entities/question/question-admin-write.repository';
import type {
    AdminQuestionForEdit,
    PublicationStatusMutationResult,
} from '@/entities/question/question.types';

export {
    invalidateAdminListCaches,
    warmAdminListConnection,
} from '@/entities/question/question-admin-list.repository';
export type { AdminQuestionListPageResult };

/** Методы admin для фасада questionRepository (без смены сигнатур). */
export const questionAdminMethods = {
    /**
     * Список вопросов для админ-панели: одна страница + totalCount (см.
     * question-admin-list.repository.ts).
     */
    findAllForAdmin(
        locale: Locale,
        filters?: AdminQuestionListFilters,
    ): Promise<AdminQuestionListPageResult> {
        return findAdminQuestionListPage(locale, filters);
    },

    // один вопрос для страницы редактирования (admin edit flow)
    findByIdForAdmin(id: string): Promise<AdminQuestionForEdit | null> {
        return findByIdForAdminWithDirectPg(id);
    },

    // создание вопроса с вариантами ответа (admin create flow)
    createWithOptions(
        input: CreateQuestionInput,
        options?: CreateQuestionOptions,
    ) {
        return createAdminQuestion(input, options);
    },

    // обновление вопроса и вариантов по id (admin edit flow)
    updateWithOptions(input: UpdateQuestionInput) {
        return updateAdminQuestion(input);
    },

    // деактивация вопроса по id (admin deactivate flow)
    deactivateById(id: string) {
        return deactivateQuestionById(id);
    },

    // активация вопроса по id (admin activate flow)
    activateById(id: string) {
        return activateQuestionById(id);
    },

    /**
     * Bulk soft-hide: isActive=false для выбранных id.
     * Один UPDATE (не цикл Prisma/$transaction). Idempotent для уже inactive.
     */
    deactivateManyByIds(ids: readonly string[]) {
        return setManyIsActiveByIds(ids, false);
    },

    /**
     * Bulk restore в витрину: isActive=true для выбранных id.
     * Не меняет publicationStatus — PUBLISHED+active попадает в quiz pool.
     */
    activateManyByIds(ids: readonly string[]) {
        return setManyIsActiveByIds(ids, true);
    },

    /**
     * Bulk DRAFT → IN_REVIEW. Уже IN_REVIEW / PUBLISHED — no-op для этих строк.
     * Quality gate — в Server Action до вызова.
     */
    submitForReviewManyByIds(ids: readonly string[]) {
        return setManyPublicationStatusByIds(ids, 'IN_REVIEW', ['DRAFT']);
    },

    /**
     * Bulk DRAFT | IN_REVIEW → PUBLISHED.
     * PUBLISHED уже — no-op. isActive не трогаем (quiz pool = active+PUBLISHED).
     * Quality gate — в Server Action до вызова.
     */
    publishManyByIds(ids: readonly string[]) {
        return setManyPublicationStatusByIds(ids, 'PUBLISHED', [
            'DRAFT',
            'IN_REVIEW',
        ]);
    },

    /**
     * Смена publicationStatus с проверкой разрешённых переходов.
     * Idempotent: уже target → already_in_target_state (без UPDATE).
     */
    setPublicationStatusById(
        id: string,
        target: QuestionPublicationStatus,
    ): Promise<PublicationStatusMutationResult> {
        return mutatePublicationStatusById(id, target);
    },

    /** DRAFT → IN_REVIEW (отправить на ревью). */
    submitForReviewById(id: string): Promise<PublicationStatusMutationResult> {
        return mutatePublicationStatusById(id, 'IN_REVIEW');
    },

    /** DRAFT | IN_REVIEW → PUBLISHED (в quiz pool, если isActive). */
    publishById(id: string): Promise<PublicationStatusMutationResult> {
        return mutatePublicationStatusById(id, 'PUBLISHED');
    },

    /** IN_REVIEW | PUBLISHED → DRAFT (отклонить / снять с публикации). */
    returnToDraftById(id: string): Promise<PublicationStatusMutationResult> {
        return mutatePublicationStatusById(id, 'DRAFT');
    },
    // удаление вопроса по id (admin delete flow)
    deleteById(id: string) {
        return deleteAdminQuestionById(id);
    },
};
