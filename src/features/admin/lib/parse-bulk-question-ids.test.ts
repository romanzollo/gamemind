/**
 * Unit-тесты нормализации bulk question ids.
 *
 * Без Neon/UI: только trim / unique / cap / FormData parsing.
 */

import { describe, expect, it } from 'vitest';

import {
    BULK_QUESTION_IDS_FIELD,
    BULK_QUESTION_IDS_MAX,
    normalizeBulkQuestionIds,
    parseBulkQuestionIdsFromFormData,
} from './parse-bulk-question-ids';

describe('normalizeBulkQuestionIds', () => {
    it('returns empty array for empty input', () => {
        expect(normalizeBulkQuestionIds([])).toEqual([]);
    });

    it('trims whitespace and drops empty strings', () => {
        expect(
            normalizeBulkQuestionIds(['  a  ', '', '   ', 'b']),
        ).toEqual(['a', 'b']);
    });

    it('keeps first occurrence when duplicates appear', () => {
        expect(
            normalizeBulkQuestionIds(['a', 'b', 'a', 'c', 'b']),
        ).toEqual(['a', 'b', 'c']);
    });

    it('caps at BULK_QUESTION_IDS_MAX unique ids', () => {
        const many = Array.from(
            { length: BULK_QUESTION_IDS_MAX + 25 },
            (_, i) => `id-${i}`,
        );
        const result = normalizeBulkQuestionIds(many);

        expect(result).toHaveLength(BULK_QUESTION_IDS_MAX);
        expect(result[0]).toBe('id-0');
        expect(result[BULK_QUESTION_IDS_MAX - 1]).toBe(
            `id-${BULK_QUESTION_IDS_MAX - 1}`,
        );
    });
});

describe('parseBulkQuestionIdsFromFormData', () => {
    it('reads multiple values under BULK_QUESTION_IDS_FIELD', () => {
        const formData = new FormData();
        formData.append(BULK_QUESTION_IDS_FIELD, 'q1');
        formData.append(BULK_QUESTION_IDS_FIELD, 'q2');
        formData.append(BULK_QUESTION_IDS_FIELD, 'q1');

        expect(parseBulkQuestionIdsFromFormData(formData)).toEqual([
            'q1',
            'q2',
        ]);
    });

    it('returns empty when field is missing', () => {
        expect(parseBulkQuestionIdsFromFormData(new FormData())).toEqual(
            [],
        );
    });

    it('ignores non-string FormData entries', () => {
        const formData = new FormData();
        formData.append(BULK_QUESTION_IDS_FIELD, 'keep-me');
        formData.append(
            BULK_QUESTION_IDS_FIELD,
            new File(['x'], 'noop.txt'),
        );

        expect(parseBulkQuestionIdsFromFormData(formData)).toEqual([
            'keep-me',
        ]);
    });
});
