import assert from 'node:assert/strict';
import test from 'node:test';

import { formatText } from '../src/utils/formatter.js';

test('formatText keeps the existing default cleanup behavior', () => {
    assert.equal(formatText('hello  世界 , api'), 'Hello 世界， API');
});

test('formatText can repair accidental copied line breaks', () => {
    const input = 'This is a copied\nline from a PDF.\n\n- keep list\n- structure';
    const output = formatText(input, { repairLineBreaks: true });

    assert.equal(output, 'This is a copied line from a PDF.\n\n- keep list\n- structure');
});

test('formatText can disable individual rules', () => {
    assert.equal(
        formatText('hello  世界 , api', {
            capitalizeAtCjkBoundary: false,
            cjkSpacing: false,
            normalizePunctuation: false,
            normalizeAbbreviations: false,
        }),
        'hello 世界, api'
    );
});
