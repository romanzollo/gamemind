/**
 * Unit-тесты плана импорта партии: что создать, что уже есть в БД.
 * Без Neon: строки «из БД» собираются в памяти.
 */

import { describe, expect, it } from 'vitest';

import {
    planDraftImport,
    type DraftImportCandidate,
    type ExistingImportRow,
} from './plan-draft-import';

const batch: DraftImportCandidate[] = [
    { index: 0, draftKey: 'b8-001', ruText: 'Кто создал Тетрис?' },
    { index: 1, draftKey: 'b8-002', ruText: 'В каком году вышел Doom?' },
    { index: 2, draftKey: 'b8-003', ruText: 'Как зовут героя Half-Life?' },
];

function actions(existing: ExistingImportRow[]) {
    return planDraftImport(batch, existing).map((decision) =>
        decision.action === 'create' ? 'create' : decision.reason,
    );
}

describe('planDraftImport', () => {
    it('пустая база — создаём всю партию', () => {
        expect(actions([])).toEqual(['create', 'create', 'create']);
    });

    it('повторный запуск после полного импорта — 0 к созданию', () => {
        const existing = batch.map((question, index) => ({
            id: `uuid-${index}`,
            contentKey: question.draftKey ?? null,
            ruText: question.ruText,
        }));

        expect(actions(existing)).toEqual([
            'content-key',
            'content-key',
            'content-key',
        ]);
    });

    it('оборванный импорт — догружаем только недостающее', () => {
        const existing = [
            { id: 'uuid-0', contentKey: 'b8-001', ruText: batch[0].ruText },
        ];

        expect(actions(existing)).toEqual(['content-key', 'create', 'create']);
    });

    it('ключ совпал, текст после правки другой — всё равно пропуск', () => {
        const existing = [
            { id: 'uuid-1', contentKey: 'b8-002', ruText: 'Doom: год выхода?' },
        ];
        const [, second] = planDraftImport(batch, existing);

        expect(second).toMatchObject({
            action: 'skip',
            reason: 'content-key',
            existingId: 'uuid-1',
        });
    });

    it('старая строка без ключа — узнаём по RU-тексту с нормализацией', () => {
        const existing = [
            {
                id: 'uuid-old',
                contentKey: null,
                ruText: '  кто   создал ТЕТРИС? ',
            },
        ];

        expect(actions(existing)).toEqual(['text', 'create', 'create']);
    });

    it('тот же текст под другим ключом — дубль из другой партии', () => {
        const existing = [
            {
                id: 'uuid-90s',
                contentKey: 'b2-017',
                ruText: 'Как зовут героя Half-Life?',
            },
        ];
        const [, , third] = planDraftImport(batch, existing);

        expect(third).toMatchObject({
            action: 'skip',
            reason: 'text-other-key',
            existingContentKey: 'b2-017',
        });
    });

    it('черновик без draftKey узнаётся только по тексту', () => {
        const candidates: DraftImportCandidate[] = [
            { index: 0, ruText: 'Кто создал Тетрис?' },
            { index: 1, ruText: 'Новый вопрос' },
        ];
        const existing = [
            { id: 'uuid-0', contentKey: 'b8-001', ruText: 'Кто создал Тетрис?' },
        ];

        expect(
            planDraftImport(candidates, existing).map((decision) =>
                decision.action === 'create' ? 'create' : decision.reason,
            ),
        ).toEqual(['text', 'create']);
    });

    it('строки без RU-текста (картинки) не мешают', () => {
        const existing = [
            { id: 'img2-001', contentKey: 'img2-001', ruText: null },
        ];

        expect(actions(existing)).toEqual(['create', 'create', 'create']);
    });
});
