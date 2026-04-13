import { appWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import React from 'react';
import { AiOutlineClose } from 'react-icons/ai';
import { BsPinFill } from 'react-icons/bs';
import { VscChromeMaximize, VscChromeMinimize, VscChromeRestore } from 'react-icons/vsc';

import { APP_FONT_FAMILY_VAR } from '../../utils/appFont';
import { osType } from '../../utils/env';

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
    },
    dragOverlay: {
        position: 'absolute',
        inset: 0,
        cursor: 'move',
        zIndex: 0,
    },
    slot: {
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
    },
    center: {
        position: 'relative',
        zIndex: 1,
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

function getButtonStyle(variant, iconOnly, active, disabled) {
    const base = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
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
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'all 120ms ease',
        boxSizing: 'border-box',
    };

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
            border: '1px solid transparent',
            background: 'transparent',
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

    return base;
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
    return (
        <button
            type='button'
            title={title}
            disabled={disabled}
            onClick={disabled ? undefined : onClick}
            style={{ ...getButtonStyle(variant, iconOnly, active, disabled), ...style }}
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
            variant='ghost'
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
            variant={active ? 'primary' : 'default'}
            active={active}
            title='Pin'
            onClick={onClick}
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
        <div style={{ ...styles.header, ...style }}>
            <div style={styles.dragOverlay} data-tauri-drag-region='true' />
            {left ? <div style={{ ...styles.slot, ...leftStyle }}>{left}</div> : null}
            <div style={{ ...styles.center, ...centerStyle }}>{center}</div>
            {right ? <div style={{ ...styles.slot, ...rightStyle }}>{right}</div> : null}
        </div>
    );
}
