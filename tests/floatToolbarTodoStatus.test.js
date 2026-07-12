import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FLOAT_TOOLBAR_STATUS_ACTIONS,
    applyStatusUpdate,
    getOpenTodoFailedStatus,
    getTodoEmptyStatus,
    getTodoFailedStatus,
    getTodoSavedStatus,
} from '../src/window/FloatToolbar/todoStatus.js';

function makeTranslator() {
    const calls = [];
    const t = (key, options = {}) => {
        calls.push({ key, options });
        return options.defaultValue;
    };

    return { calls, t };
}

test('todo saved status exposes the open todo action when items were saved', () => {
    const { calls, t } = makeTranslator();
    const status = getTodoSavedStatus(2, t);

    assert.deepEqual(status, {
        text: 'Saved 2 todo item',
        action: FLOAT_TOOLBAR_STATUS_ACTIONS.OPEN_TODO,
    });
    assert.deepEqual(calls, [
        {
            key: 'float_toolbar.todo_saved',
            options: {
                count: 2,
                defaultValue: 'Saved 2 todo item',
            },
        },
    ]);
});

test('todo saved status does not expose an action when no todo item was produced', () => {
    assert.deepEqual(getTodoSavedStatus(0), {
        text: 'Saved 0 todo item',
        action: null,
    });
});

test('todo empty and failure statuses clear any panel action', () => {
    assert.deepEqual(getTodoEmptyStatus(), {
        text: 'No text selected',
        action: null,
    });
    assert.deepEqual(getTodoFailedStatus(), {
        text: 'Failed to save todo',
        action: null,
    });
    assert.deepEqual(getOpenTodoFailedStatus(), {
        text: 'Failed to open todo',
        action: null,
    });
});

test('applyStatusUpdate writes text and clears missing actions', () => {
    const writes = [];

    applyStatusUpdate(
        {
            text: 'Failed to open todo',
        },
        {
            setStatusAction: (value) => writes.push(['action', value]),
            setStatusText: (value) => writes.push(['text', value]),
        }
    );

    assert.deepEqual(writes, [
        ['action', null],
        ['text', 'Failed to open todo'],
    ]);
});
