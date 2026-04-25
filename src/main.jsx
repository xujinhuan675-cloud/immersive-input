import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { appWindow } from '@tauri-apps/api/window';
import { NextUIProvider } from '@nextui-org/react';
import ReactDOM from 'react-dom/client';
import React from 'react';

import { initStore } from './utils/store';
import { initEnv } from './utils/env';
import App from './App';

const isConfigWindow = appWindow.label === 'config';
const STARTUP_SOFT_TIMEOUT_MS = 2000;
const STARTUP_COMMIT_TIMEOUT_MS = 1500;

if (import.meta.env.PROD) {
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

// Only the config window needs the startup loading overlay.
if (isConfigWindow) {
    const el = document.getElementById('app-loading');
    if (el) el.style.display = 'flex';
}

function settleStartupTask(name, taskFactory) {
    let timeoutId = null;

    const task = Promise.resolve()
        .then(taskFactory)
        .catch((error) => {
            console.error(`[startup] ${name} failed`, error);
        })
        .finally(() => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        });

    const timeout = new Promise((resolve) => {
        timeoutId = setTimeout(() => {
            resolve();
        }, STARTUP_SOFT_TIMEOUT_MS);
    });

    return Promise.race([task, timeout]);
}

function hideStartupLoading(loadingEl) {
    if (!loadingEl) {
        return;
    }

    if (isConfigWindow) {
        loadingEl.classList.add('fade-out');
        setTimeout(() => loadingEl.remove(), 200);
        return;
    }

    loadingEl.remove();
}

function waitForRootCommit(rootElement) {
    return new Promise((resolve) => {
        if (!rootElement || rootElement.childNodes.length > 0) {
            resolve('already-committed');
            return;
        }

        let finished = false;
        let timeoutId = null;
        let observer = null;

        const finish = (reason) => {
            if (finished) {
                return;
            }

            finished = true;
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (observer) {
                observer.disconnect();
            }
            resolve(reason);
        };

        observer = new MutationObserver(() => {
            if (rootElement.childNodes.length > 0) {
                finish('mutation');
            }
        });
        observer.observe(rootElement, { childList: true });

        timeoutId = setTimeout(() => {
            finish('timeout');
        }, STARTUP_COMMIT_TIMEOUT_MS);
    });
}

function renderApp() {
    const rootElement = document.getElementById('root');
    const loadingEl = document.getElementById('app-loading');
    const root = ReactDOM.createRoot(rootElement);
    try {
        root.render(
            <NextUIProvider>
                <NextThemesProvider attribute='class'>
                    <App />
                </NextThemesProvider>
            </NextUIProvider>
        );
    } catch (error) {
        console.error('[startup] root render failed', error);
        hideStartupLoading(loadingEl);
        throw error;
    }

    waitForRootCommit(rootElement).then(() => {
        hideStartupLoading(loadingEl);
    });
}

Promise.allSettled([
    settleStartupTask('initStore', () => initStore()),
    settleStartupTask('initEnv', () => initEnv()),
]).finally(() => {
    renderApp();
});
