export const WINDOW_INTERACTION_CURSOR = Object.freeze({
    drag: 'var(--app-cursor-drag)',
    click: 'var(--app-cursor-click)',
    disabled: 'var(--app-cursor-disabled)',
});

export function getWindowActionCursor(disabled = false) {
    return disabled ? WINDOW_INTERACTION_CURSOR.disabled : WINDOW_INTERACTION_CURSOR.click;
}
