import assert from 'node:assert/strict';
import test from 'node:test';

import {
    normalizeInputTextLineEndings,
    shouldPasteInputText,
} from '../src/utils/streamInput.js';

test('normalizeInputTextLineEndings normalizes CRLF and CR to LF', () => {
    assert.equal(
        normalizeInputTextLineEndings('first\r\nsecond\rthird\nfourth'),
        'first\nsecond\nthird\nfourth'
    );
});

test('shouldPasteInputText uses paste for multiline content by default', () => {
    assert.equal(shouldPasteInputText('single line'), false);
    assert.equal(shouldPasteInputText('first\nsecond'), true);
    assert.equal(shouldPasteInputText('first\rsecond'), true);
});

test('shouldPasteInputText supports explicit opt-in and multiline opt-out', () => {
    assert.equal(shouldPasteInputText('single line', { pasteOnWrite: true }), true);
    assert.equal(shouldPasteInputText('first\nsecond', { pasteOnMultiline: false }), false);
});
