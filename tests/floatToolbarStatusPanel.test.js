import assert from 'node:assert/strict';
import test from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { FloatToolbarStatusPanel } from '../src/window/FloatToolbar/StatusPanel.js';
import { FLOAT_TOOLBAR_STATUS_ACTIONS } from '../src/window/FloatToolbar/todoStatus.js';

function renderStatusPanel(props) {
    return renderToStaticMarkup(React.createElement(FloatToolbarStatusPanel, props));
}

test('FloatToolbarStatusPanel renders an open todo button for saved todo status', () => {
    const html = renderStatusPanel({
        statusAction: FLOAT_TOOLBAR_STATUS_ACTIONS.OPEN_TODO,
        statusText: '已记入 1 条待办',
        t: (key, options) => (key === 'float_toolbar.open_todo_title' ? '打开待办' : options.defaultValue),
    });

    assert.match(html, /已记入 1 条待办/);
    assert.match(html, /<button/);
    assert.match(html, /aria-label="打开待办"/);
});

test('FloatToolbarStatusPanel does not render an action button without a status action', () => {
    const html = renderStatusPanel({
        statusAction: null,
        statusText: '记入待办失败',
    });

    assert.match(html, /记入待办失败/);
    assert.doesNotMatch(html, /<button/);
});

test('FloatToolbarStatusPanel renders nothing when status text is empty', () => {
    assert.equal(
        renderStatusPanel({
            statusAction: FLOAT_TOOLBAR_STATUS_ACTIONS.OPEN_TODO,
            statusText: '',
        }),
        ''
    );
});
