import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { appWindow } from '@tauri-apps/api/window';
import { NextUIProvider } from '@nextui-org/react';
import ReactDOM from 'react-dom/client';
import React from 'react';

import { initStore } from './utils/store';
import { initEnv } from './utils/env';
import App from './App';

if (import.meta.env.PROD) {
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

// 仅 config 窗口需要 loading 递层
if (appWindow.label === 'config') {
    const el = document.getElementById('app-loading');
    if (el) el.style.display = 'flex';
}

initStore().then(async () => {
    await initEnv();
    const rootElement = document.getElementById('root');
    const loadingEl = document.getElementById('app-loading');
    const t0 = performance.now();
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <NextUIProvider>
            <NextThemesProvider attribute='class'>
                <App />
            </NextThemesProvider>
        </NextUIProvider>
    );
    // 双帧 rAF：确保 React 首次渲染已提交到 DOM
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const elapsed = Math.round(performance.now() - t0);
            console.debug(`[startup] React first paint: ${elapsed}ms after store init`);
            if (loadingEl) {
                const label = appWindow.label;
                if (label === 'config') {
                    // Config 窗口：淡出过渡（展示 loading 过程更平滑）
                    loadingEl.classList.add('fade-out');
                    setTimeout(() => loadingEl.remove(), 200);
                } else {
                    // 其他窗口（工具栏、翻译等透明窗口）：立即移除，避免白色闪烁
                    loadingEl.remove();
                }
            }
        });
    });
});
