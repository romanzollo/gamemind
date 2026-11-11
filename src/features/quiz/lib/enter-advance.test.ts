import { describe, expect, it } from 'vitest';

import { isEnterAdvance, type EnterAdvanceKey } from './enter-advance';

const enter: EnterAdvanceKey = {
    key: 'Enter',
    repeat: false,
    isComposing: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
};

describe('isEnterAdvance', () => {
    it('advances on a plain Enter over the page or an answer radio', () => {
        expect(isEnterAdvance(enter, { tagName: 'BODY' })).toBe(true);
        expect(isEnterAdvance(enter, { tagName: 'INPUT', type: 'radio' })).toBe(true);
        expect(isEnterAdvance(enter, null)).toBe(true);
    });

    it('ignores other keys, held Enter, IME and modifiers', () => {
        expect(isEnterAdvance({ ...enter, key: ' ' }, null)).toBe(false);
        expect(isEnterAdvance({ ...enter, repeat: true }, null)).toBe(false);
        expect(isEnterAdvance({ ...enter, isComposing: true }, null)).toBe(false);
        expect(isEnterAdvance({ ...enter, ctrlKey: true }, null)).toBe(false);
    });

    it('leaves Enter to buttons, links, text fields and the volume slider', () => {
        expect(isEnterAdvance(enter, { tagName: 'BUTTON' })).toBe(false);
        expect(isEnterAdvance(enter, { tagName: 'A' })).toBe(false);
        expect(isEnterAdvance(enter, { tagName: 'INPUT', type: 'text' })).toBe(false);
        expect(isEnterAdvance(enter, { tagName: 'INPUT', type: 'range' })).toBe(false);
        expect(isEnterAdvance(enter, { tagName: 'DIV', isContentEditable: true })).toBe(false);
    });
});
