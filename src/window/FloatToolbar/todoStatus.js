export const FLOAT_TOOLBAR_STATUS_ACTIONS = Object.freeze({
    OPEN_TODO: 'open_todo',
});

function translate(t, key, options) {
    return typeof t === 'function' ? t(key, options) : options.defaultValue;
}

export function getTodoEmptyStatus(t) {
    return {
        text: translate(t, 'float_toolbar.todo_empty', {
            defaultValue: 'No text selected',
        }),
        action: null,
    };
}

export function getTodoSavedStatus(count, t) {
    const itemCount = Number(count) || 0;

    return {
        text: translate(t, 'float_toolbar.todo_saved', {
            count: itemCount,
            defaultValue: `Saved ${itemCount} todo item`,
        }),
        action: itemCount > 0 ? FLOAT_TOOLBAR_STATUS_ACTIONS.OPEN_TODO : null,
    };
}

export function getTodoFailedStatus(t) {
    return {
        text: translate(t, 'float_toolbar.todo_failed', {
            defaultValue: 'Failed to save todo',
        }),
        action: null,
    };
}

export function getOpenTodoFailedStatus(t) {
    return {
        text: translate(t, 'float_toolbar.open_todo_failed', {
            defaultValue: 'Failed to open todo',
        }),
        action: null,
    };
}

export function applyStatusUpdate(status, { setStatusAction, setStatusText }) {
    setStatusAction(status.action ?? null);
    setStatusText(status.text);
}
