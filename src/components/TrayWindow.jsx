import React from 'react';

import { osType } from '../utils/env';

function cx(...values) {
    return values.filter(Boolean).join(' ');
}

export const TRAY_WINDOW_HEADER_STYLE = {
    minHeight: '46px',
    padding: '6px 10px',
    background: 'rgba(249, 250, 251, 0.96)',
    borderBottom: '1px solid rgba(226, 232, 240, 0.88)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
};

export const TRAY_WINDOW_TITLE_STYLE = {
    gap: '6px',
};

export const TRAY_WINDOW_TITLE_TEXT_STYLE = {
    fontSize: '14px',
    fontWeight: 700,
    color: '#0f172a',
};

export const TRAY_WINDOW_PRIMARY_BUTTON_STYLE = {
    border: '1px solid rgba(15, 23, 42, 0.84)',
    background: '#0f172a',
    color: '#ffffff',
    boxShadow: '0 8px 20px -16px rgba(15, 23, 42, 0.45)',
};

export function TrayWindow({ children, className = '', style, ...props }) {
    return (
        <div
            className={cx(
                'flex h-screen w-screen flex-col overflow-hidden',
                osType === 'Linux' && 'rounded-[10px] border border-default-100',
                className
            )}
            style={{
                background: '#f3f5f7',
                color: '#0f172a',
                ...style,
            }}
            {...props}
        >
            {children}
        </div>
    );
}

export function TrayWindowBody({ children, className = '', style, ...props }) {
    return (
        <div
            className={cx('flex-1 min-h-0 overflow-hidden px-3 py-2.5', className)}
            style={style}
            {...props}
        >
            {children}
        </div>
    );
}

export function TrayWindowSurface({ children, className = '', style, ...props }) {
    return (
        <div
            className={cx('flex h-full min-h-0 min-w-0 flex-col overflow-hidden', className)}
            style={{
                border: '1px solid rgba(226, 232, 240, 0.84)',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.92)',
                boxShadow: '0 18px 40px -30px rgba(15, 23, 42, 0.32), 0 2px 8px rgba(255, 255, 255, 0.42) inset',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
                ...style,
            }}
            {...props}
        >
            {children}
        </div>
    );
}
