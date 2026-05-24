import { appWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import React from 'react';
import { AiOutlineClose } from 'react-icons/ai';
import { BsPinFill } from 'react-icons/bs';
import { VscChromeMaximize, VscChromeMinimize, VscChromeRestore } from 'react-icons/vsc';

import { APP_FONT_FAMILY_VAR } from '../../utils/appFont';
import { osType } from '../../utils/env';
import { getWindowActionCursor, WINDOW_INTERACTION_CURSOR } from '../../styles/interaction';

const styles = {
    header: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minHeight: '44px',
        padding: '8px 12px',
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        flexShrink: 0,
        boxSizing: 'border-box',
        cursor: WINDOW_INTERACTION_CURSOR.drag,
    },
    slot: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
    },
    center: {
        position: 'relative',
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    title: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        minWidth: 0,
        fontFamily: APP_FONT_FAMILY_VAR,
        fontSize: '14px',
        fontWeight: 700,
        color: '#111827',
        letterSpacing: '0.01em',
    },
    titleText: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
};

const NON_DRAG_SELECTOR = [
    'button',
    'input',
    'textarea',
    'select',
    'option',
    'a',
    '[role="button"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[data-no-window-drag="true"]',
    '[data-clickable="true"]',
].join(',');

function startWindowDrag(event) {
    if (event.button !== 0) {
        return;
    }

    const target = event.target;
    if (target instanceof HTMLElement && target.closest(NON_DRAG_SELECTOR)) {
        return;
    }

    void appWindow.startDragging().catch(() => {});
}

function getButtonStyle(variant, iconOnly, active, disabled, hovered) {
    const base = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        width: iconOnly ? '32px' : undefined,
        minWidth: iconOnly ? '32px' : 'auto',
        height: '32px',
        padding: iconOnly ? '0' : '0 12px',
        borderRadius: '10px',
        border: '1px solid #dbe2ea',
        background: '#fff',
        color: '#4b5563',
        fontFamily: APP_FONT_FAMILY_VAR,
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: 1,
        cursor: getWindowActionCursor(disabled),
        opacity: disabled ? 0.55 : 1,
        transition: 'all 120ms ease',
        boxSizing: 'border-box',
    };

    if (variant === 'close') {
        return {
            ...base,
            border: hovered && !disabled ? '1px solid rgba(254, 202, 202, 0.96)' : '1px solid transparent',
            background: hovered && !disabled ? 'rgba(254, 242, 242, 0.96)' : 'transparent',
            color: hovered && !disabled ? '#dc2626' : '#4b5563',
        };
    }

    if (variant === 'pin') {
        return {
            ...base,
            border: hovered && !disabled ? '1px solid rgba(226, 232, 240, 0.96)' : '1px solid transparent',
            background: hovered && !disabled ? 'rgba(15, 23, 42, 0.06)' : 'transparent',
            color: active ? '#2563eb' : '#4b5563',
            boxShadow: 'none',
        };
    }

    if (variant === 'primary' || active) {
        return {
            ...base,
            border: '1px solid #4a7cfa',
            background: '#4a7cfa',
            color: '#fff',
        };
    }

    if (variant === 'ghost') {
        return {
            ...base,
            border: hovered && !disabled ? '1px solid rgba(226, 232, 240, 0.96)' : '1px solid transparent',
            background: hovered && !disabled ? 'rgba(15, 23, 42, 0.06)' : 'transparent',
            color: '#4b5563',
        };
    }

    if (variant === 'danger') {
        return {
            ...base,
            border: '1px solid #fecaca',
            background: '#fff5f5',
            color: '#dc2626',
        };
    }

    return {
        ...base,
        border: hovered && !disabled ? '1px solid rgba(203, 213, 225, 0.96)' : base.border,
        background: hovered && !disabled ? 'rgba(248, 250, 252, 0.98)' : base.background,
    };
}

export function WindowHeaderButton({
    children,
    onClick,
    variant = 'default',
    iconOnly = false,
    active = false,
    disabled = false,
    title,
    style,
}) {
    const [hovered, setHovered] = React.useState(false);

    return (
        <button
            type='button'
            title={title}
            disabled={disabled}
            onClick={disabled ? undefined : onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onBlur={() => setHovered(false)}
            style={{ ...getButtonStyle(variant, iconOnly, active, disabled, hovered), ...style }}
        >
            {children}
        </button>
    );
}

export function WindowHeaderTitle({ icon, children, style, textStyle }) {
    return (
        <div style={{ ...styles.title, ...style }}>
            {icon ? <span>{icon}</span> : null}
            <span style={{ ...styles.titleText, ...textStyle }}>{children}</span>
        </div>
    );
}

export function WindowHeaderCloseButton({ label, showLabel = false, hideOnDarwin = false, onClick }) {
    if (hideOnDarwin && osType === 'Darwin') {
        return null;
    }

    return (
        <WindowHeaderButton
            iconOnly={!showLabel}
            variant='close'
            title={label || 'Close'}
            onClick={onClick || (() => appWindow.close())}
        >
            <AiOutlineClose className='text-[16px]' />
            {showLabel ? <span>{label}</span> : null}
        </WindowHeaderButton>
    );
}

export function WindowHeaderPinButton({ active = false, onClick, hideOnDarwin = false }) {
    if (hideOnDarwin && osType === 'Darwin') {
        return null;
    }

    return (
        <WindowHeaderButton
            iconOnly
            variant='pin'
            title={active ? 'Unpin' : 'Pin'}
            onClick={onClick}
            active={active}
        >
            <BsPinFill className='text-[14px]' />
        </WindowHeaderButton>
    );
}

export function WindowHeaderMinimizeButton({ hideOnDarwin = false }) {
    if (hideOnDarwin && osType === 'Darwin') {
        return null;
    }

    return (
        <WindowHeaderButton iconOnly variant='ghost' title='Minimize' onClick={() => appWindow.minimize()}>
            <VscChromeMinimize className='text-[14px]' />
        </WindowHeaderButton>
    );
}

export function WindowHeaderMaximizeButton({ hideOnDarwin = false }) {
    const [isMaximized, setIsMaximized] = React.useState(false);

    React.useEffect(() => {
        let disposed = false;

        const syncWindowState = async () => {
            const nextState = await appWindow.isMaximized();
            if (!disposed) {
                setIsMaximized(nextState);
            }
        };

        void syncWindowState();

        const unlisten = listen('tauri://resize', () => {
            void syncWindowState();
        });

        return () => {
            disposed = true;
            void unlisten.then((fn) => fn());
        };
    }, []);

    if (hideOnDarwin && osType === 'Darwin') {
        return null;
    }

    return (
        <WindowHeaderButton
            iconOnly
            variant='ghost'
            title={isMaximized ? 'Restore' : 'Maximize'}
            onClick={async () => {
                if (await appWindow.isMaximized()) {
                    await appWindow.unmaximize();
                } else {
                    await appWindow.maximize();
                }
            }}
        >
            {isMaximized ? (
                <VscChromeRestore className='text-[13px]' />
            ) : (
                <VscChromeMaximize className='text-[13px]' />
            )}
        </WindowHeaderButton>
    );
}

export function WindowHeaderWindowControls({ hideOnDarwin = false }) {
    if (hideOnDarwin && osType === 'Darwin') {
        return null;
    }

    return (
        <>
            <WindowHeaderMinimizeButton />
            <WindowHeaderMaximizeButton />
            <WindowHeaderCloseButton />
        </>
    );
}

export default function WindowHeader({
    left,
    center,
    right,
    style,
    centerStyle,
    leftStyle,
    rightStyle,
}) {
    return (
        <div
            style={{ ...styles.header, ...style }}
            onMouseDown={startWindowDrag}
        >
            {left ? <div style={{ ...styles.slot, ...leftStyle }}>{left}</div> : null}
            <div style={{ ...styles.center, ...centerStyle }}>{center}</div>
            {right ? <div style={{ ...styles.slot, ...rightStyle }}>{right}</div> : null}
        </div>
    );
}
