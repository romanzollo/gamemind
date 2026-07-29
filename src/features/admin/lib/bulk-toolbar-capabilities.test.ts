/**
 * Unit-тесты контекстных bulk-кнопок admin questions.
 * AAA: arrange selection → act getBulkToolbarCapabilities → assert flags.
 */

import { describe, expect, it } from 'vitest';

import {
    getBulkToolbarCapabilities,
    hasBulkMutationActions,
    type BulkToolbarEntry,
} from './bulk-toolbar-capabilities';

function entry(
    partial: Partial<BulkToolbarEntry> &
        Pick<BulkToolbarEntry, 'publicationStatus'>,
): BulkToolbarEntry {
    return {
        isActive: partial.isActive ?? true,
        publicationStatus: partial.publicationStatus,
    };
}

describe('getBulkToolbarCapabilities', () => {
    it('returns all false for empty selection', () => {
        const caps = getBulkToolbarCapabilities([]);

        expect(caps).toEqual({
            canDeactivate: false,
            canActivate: false,
            canSubmitForReview: false,
            canPublish: false,
        });
        expect(hasBulkMutationActions(caps)).toBe(false);
    });

    it('hides publish and review for already PUBLISHED active rows', () => {
        const caps = getBulkToolbarCapabilities([
            entry({ publicationStatus: 'PUBLISHED', isActive: true }),
            entry({ publicationStatus: 'PUBLISHED', isActive: true }),
        ]);

        expect(caps.canPublish).toBe(false);
        expect(caps.canSubmitForReview).toBe(false);
        expect(caps.canDeactivate).toBe(true);
        expect(caps.canActivate).toBe(false);
        expect(hasBulkMutationActions(caps)).toBe(true);
    });

    it('shows activate only when some selected are inactive', () => {
        const caps = getBulkToolbarCapabilities([
            entry({ publicationStatus: 'PUBLISHED', isActive: false }),
        ]);

        expect(caps.canActivate).toBe(true);
        expect(caps.canDeactivate).toBe(false);
    });

    it('shows both visibility actions for mixed isActive', () => {
        const caps = getBulkToolbarCapabilities([
            entry({ publicationStatus: 'PUBLISHED', isActive: true }),
            entry({ publicationStatus: 'PUBLISHED', isActive: false }),
        ]);

        expect(caps.canDeactivate).toBe(true);
        expect(caps.canActivate).toBe(true);
    });

    it('shows submit-for-review and publish for DRAFT', () => {
        const caps = getBulkToolbarCapabilities([
            entry({ publicationStatus: 'DRAFT' }),
        ]);

        expect(caps.canSubmitForReview).toBe(true);
        expect(caps.canPublish).toBe(true);
    });

    it('shows publish but not submit-for-review for IN_REVIEW only', () => {
        const caps = getBulkToolbarCapabilities([
            entry({ publicationStatus: 'IN_REVIEW' }),
        ]);

        expect(caps.canSubmitForReview).toBe(false);
        expect(caps.canPublish).toBe(true);
    });

    it('mixed PUBLISHED + DRAFT exposes publish/review only from DRAFT', () => {
        const caps = getBulkToolbarCapabilities([
            entry({ publicationStatus: 'PUBLISHED' }),
            entry({ publicationStatus: 'DRAFT' }),
        ]);

        expect(caps.canSubmitForReview).toBe(true);
        expect(caps.canPublish).toBe(true);
        expect(caps.canDeactivate).toBe(true);
    });
});
