/**
 * Локализация кодов quality gate (publish / submit-for-review).
 *
 * Зачем отдельно от getAdminErrorMessage: это не AdminErrorCode Server Action,
 * а доменные коды из getQuestionPublishQualityIssues — UI списка на edit.
 */

import type { Dictionary } from '@/shared/i18n';

import type { QuestionPublishQualityCode } from './question-publish-quality';

const QUALITY_MAP: Record<
    QuestionPublishQualityCode,
    keyof Dictionary['admin']['publishQuality']
> = {
    MISSING_PROMPT_IMAGE: 'missingPromptImage',
    NOT_EXACTLY_ONE_CORRECT: 'notExactlyOneCorrect',
    TOO_FEW_OPTIONS: 'tooFewOptions',
    MISSING_QUESTION_TEXT: 'missingQuestionText',
    MISSING_OPTION_TEXT: 'missingOptionText',
    DUPLICATE_OPTION_TEXT: 'duplicateOptionText',
    IDENTICAL_QUESTION_LOCALES: 'identicalQuestionLocales',
    IDENTICAL_OPTION_LOCALES: 'identicalOptionLocales',
    INACTIVE_WILL_STAY_HIDDEN: 'inactiveWillStayHidden',
};

export function getPublishQualityMessage(
    dictionary: Dictionary,
    code: QuestionPublishQualityCode,
): string {
    return dictionary.admin.publishQuality[QUALITY_MAP[code]];
}
