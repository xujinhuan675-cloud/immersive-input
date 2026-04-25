import React, { useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

const WRAP_STYLE = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
};

const CARD_STYLE = {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    border: '1px solid rgba(203, 213, 225, 0.92)',
    background: 'rgba(255, 255, 255, 0.98)',
    boxShadow: '0 4px 10px -12px rgba(15, 23, 42, 0.18)',
    userSelect: 'none',
    overflow: 'hidden',
    boxSizing: 'border-box',
};

const BUTTON_PALETTE = {
    restBg: 'rgba(100, 116, 139, 0.06)',
    hoverBg: 'rgba(100, 116, 139, 0.08)',
    activeBg: 'rgba(100, 116, 139, 0.14)',
    color: '#64748b',
};

const BUTTON_STYLE = {
    width: '100%',
    height: '100%',
    border: 'none',
    borderRadius: '8px',
    background: BUTTON_PALETTE.restBg,
    color: BUTTON_PALETTE.color,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 120ms ease, color 120ms ease',
    outline: 'none',
    flexShrink: 0,
    padding: 0,
};

const HANDLE_MARK_STYLE = {
    position: 'relative',
    width: '14px',
    height: '13px',
    color: '#697586',
    pointerEvents: 'none',
};

const HANDLE_SPARKLE_STYLE = {
    position: 'absolute',
    top: '1px',
    left: '2px',
    width: '4px',
    height: '4px',
    color: '#697586',
    pointerEvents: 'none',
};

const HANDLE_SPARKLE_DOT_STYLE = {
    position: 'absolute',
    top: '5px',
    left: '1px',
    width: '2px',
    height: '2px',
    color: '#697586',
    pointerEvents: 'none',
};

const HANDLE_TEXT_STYLE = {
    position: 'absolute',
    right: '0',
    bottom: '0',
    color: '#697586',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontWeight: 700,
    fontSize: '9.5px',
    lineHeight: 1,
    letterSpacing: '-0.02em',
    pointerEvents: 'none',
};

function applyButtonVisualState(element, state) {
    if (!element) return;

    element.style.background =
        state === 'active'
            ? BUTTON_PALETTE.activeBg
            : state === 'hover'
              ? BUTTON_PALETTE.hoverBg
              : BUTTON_PALETTE.restBg;
    element.style.color = BUTTON_PALETTE.color;
}

function HandleMark() {
    return (
        <div style={HANDLE_MARK_STYLE} aria-hidden='true'>
            <svg
                viewBox='0 0 4 4'
                fill='none'
                style={HANDLE_SPARKLE_DOT_STYLE}
            >
                <path
                    d='M2 0.2L2.55 1.45L3.8 2L2.55 2.55L2 3.8L1.45 2.55L0.2 2L1.45 1.45L2 0.2Z'
                    fill='currentColor'
                />
            </svg>
            <svg
                viewBox='0 0 8 8'
                fill='none'
                style={HANDLE_SPARKLE_STYLE}
            >
                <path
                    d='M4 0.35L5.05 2.95L7.65 4L5.05 5.05L4 7.65L2.95 5.05L0.35 4L2.95 2.95L4 0.35Z'
                    fill='currentColor'
                />
            </svg>
            <span style={HANDLE_TEXT_STYLE}>Ai</span>
        </div>
    );
}

export default function InputAiHandle() {
    const openingRef = useRef(false);

    const openEditor = async () => {
        if (openingRef.current) return;

        openingRef.current = true;
        try {
            await invoke('open_light_ai_from_input_handle');
        } catch (error) {
            console.error('open_light_ai_from_input_handle error:', error);
        } finally {
            window.setTimeout(() => {
                openingRef.current = false;
            }, 240);
        }
    };

    return (
        <div style={WRAP_STYLE}>
            <div style={CARD_STYLE}>
                <button
                    type='button'
                    title='AI'
                    aria-label='AI'
                    style={BUTTON_STYLE}
                    onMouseDown={(event) => {
                        event.preventDefault();
                        applyButtonVisualState(event.currentTarget, 'active');
                        void openEditor();
                    }}
                    onMouseEnter={(event) =>
                        applyButtonVisualState(event.currentTarget, 'hover')
                    }
                    onMouseLeave={(event) =>
                        applyButtonVisualState(event.currentTarget, 'rest')
                    }
                    onMouseUp={(event) =>
                        applyButtonVisualState(event.currentTarget, 'hover')
                    }
                    onFocus={(event) =>
                        applyButtonVisualState(event.currentTarget, 'hover')
                    }
                    onBlur={(event) =>
                        applyButtonVisualState(event.currentTarget, 'rest')
                    }
                    onClick={(event) => {
                        event.preventDefault();
                    }}
                >
                    <HandleMark />
                </button>
            </div>
        </div>
    );
}
