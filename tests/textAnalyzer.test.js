import assert from 'node:assert/strict';
import test from 'node:test';

import { detectType } from '../src/utils/textAnalyzer.js';

test('detects Windows local paths as file paths', () => {
    assert.equal(
        detectType(
            'F:\\AnchorOS\\immersive-input-chrome\\app\\chrome-extension\\.output\\chrome-mv3-web-store'
        ),
        'filepath'
    );
    assert.equal(detectType('C:/Users/me/Desktop/note.txt'), 'filepath');
});

test('detects file URIs and UNC paths as file paths', () => {
    assert.equal(detectType('file:///F:/AnchorOS/Immersive-Input/index.html'), 'filepath');
    assert.equal(detectType('\\\\server\\share\\folder\\note.txt'), 'filepath');
});
