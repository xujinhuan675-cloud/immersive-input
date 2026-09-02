import assert from 'node:assert/strict';
import test from 'node:test';

import { getPhraseTagLabel } from '../src/window/Phrases/tagLabels.js';

test('getPhraseTagLabel translates built-in tags through the active translator', () => {
    const calls = [];
    const label = getPhraseTagLabel({ name: '地址' }, (key, options) => {
        calls.push({ key, options });
        return 'Address';
    });

    assert.equal(label, 'Address');
    assert.deepEqual(calls, [
        {
            key: 'phrases.default_tags.address',
            options: { defaultValue: '地址' },
        },
    ]);
});

test('getPhraseTagLabel preserves custom tag names', () => {
    const translator = () => {
        throw new Error('custom tags should not be translated');
    };

    assert.equal(getPhraseTagLabel({ name: '客户跟进' }, translator), '客户跟进');
});
