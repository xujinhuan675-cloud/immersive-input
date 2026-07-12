import React from 'react';
import { LuFolderOpen } from 'react-icons/lu';

import { FLOAT_TOOLBAR_STATUS_ACTIONS } from './todoStatus.js';

export const STATUS_PANEL_STYLE = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderTop: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(248, 250, 252, 0.72)',
    minHeight: '44px',
    color: '#334155',
    fontSize: '12px',
    fontWeight: 600,
};

const STATUS_TEXT_STYLE = {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};

const STATUS_ACTION_BUTTON_STYLE = {
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: '9px',
    background: 'rgba(15, 23, 42, 0.06)',
    color: '#475569',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 120ms ease, color 120ms ease',
    flexShrink: 0,
};

function translate(t, key, options) {
    return typeof t === 'function' ? t(key, options) : options.defaultValue;
}

function setActionButtonHoverState(event, active) {
    event.currentTarget.style.background = active ? 'rgba(15, 23, 42, 0.10)' : 'rgba(15, 23, 42, 0.06)';
    event.currentTarget.style.color = active ? '#1f2937' : '#475569';
}

export function FloatToolbarStatusPanel({ statusAction, statusText, onOpenTodo, t }) {
    if (!statusText) {
        return null;
    }

    const shouldShowOpenTodo = statusAction === FLOAT_TOOLBAR_STATUS_ACTIONS.OPEN_TODO;
    const openTodoTitle = translate(t, 'float_toolbar.open_todo_title', {
        defaultValue: 'Open todo',
    });

    return React.createElement(
        'div',
        { style: STATUS_PANEL_STYLE },
        React.createElement('span', { style: STATUS_TEXT_STYLE }, statusText),
        shouldShowOpenTodo
            ? React.createElement(
                  'button',
                  {
                      type: 'button',
                      title: openTodoTitle,
                      'aria-label': openTodoTitle,
                      style: STATUS_ACTION_BUTTON_STYLE,
                      onClick: () => {
                          onOpenTodo?.();
                      },
                      onMouseEnter: (event) => setActionButtonHoverState(event, true),
                      onMouseLeave: (event) => setActionButtonHoverState(event, false),
                  },
                  React.createElement(LuFolderOpen, { size: 15 })
              )
            : null
    );
}
