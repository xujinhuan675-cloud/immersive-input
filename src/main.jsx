import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { appWindow } from '@tauri-apps/api/window';
import { NextUIProvider } from '@nextui-org/react';
import ReactDOM from 'react-dom/client';
import React from 'react';
import {
    debug as logDebug,
    error as logError,
    info as logInfo,
    trace as logTrace,
    warn as logWarn,
} from 'tauri-plugin-log-api';

import { initStore } from './utils/store';
import { initEnv } from './utils/env';
import App from './App';

const isConfigWindow = appWindow.label === 'config';
const STARTUP_SOFT_TIMEOUT_MS = 2000;
const STARTUP_COMMIT_TIMEOUT_MS = 1500;

function formatLogValue(value) {
    if (value instanceof Error) {
        return value.stack || value.message;
    }

    if (typeof value === 'string') {
        return value;
    }

    if (value === undefined) {
        return 'undefined';
    }

    try {
        return JSON.stringify(value);
    } catch (_) {
        return String(value);
    }
}

function logToBackend(level, args) {
    const text = args.map(formatLogValue).join(' ');
    const message = `[frontend][${appWindow.label}] ${text}`;
    const logger = {
        trace: logTrace,
        debug: logDebug,
        info: logInfo,
        warn: logWarn,
        error: logError,
    }[level] || logInfo;
    return logger(message).catch(() => {});
}

function installFrontendDiagnostics() {
    if (window.__IMMERSIVE_INPUT_FRONTEND_LOG_INSTALLED__) {
        return;
    }
    window.__IMMERSIVE_INPUT_FRONTEND_LOG_INSTALLED__ = true;

    const originals = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        debug: console.debug.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
    };

    let forwarding = false;
    const forward = (level, args) => {
        if (forwarding) {
            return;
        }

        forwarding = true;
        void logToBackend(level, args).finally(() => {
            forwarding = false;
        });
    };

    console.log = (...args) => {
        originals.log(...args);
        forward('info', args);
    };
    console.info = (...args) => {
        originals.info(...args);
        forward('info', args);
    };
    console.debug = (...args) => {
        originals.debug(...args);
        forward('debug', args);
    };
    console.warn = (...args) => {
        originals.warn(...args);
        forward('warn', args);
    };
    console.error = (...args) => {
        originals.error(...args);
        forward('error', args);
    };

    window.addEventListener('error', (event) => {
        const location = event.filename
            ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}`
            : 'unknown';
        forward('error', [`window.error ${location}`, event.message || event.error || 'Unknown error']);
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        forward('error', [
            'window.unhandledrejection',
            reason instanceof Error ? reason : formatLogValue(reason),
        ]);
    });

    if (Array.isArray(window.__BOOT_ERRORS__)) {
        window.__BOOT_ERRORS__.forEach((entry) => {
            forward('error', ['boot.error', entry && entry.ts ? entry.ts : '', entry?.message || entry]);
        });
    }

    forward('info', ['frontend diagnostics installed']);
}

installFrontendDiagnostics();

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
    const startedAt = performance.now();
    let timeoutId = null;
    let finished = false;

    const task = Promise.resolve()
        .then(taskFactory)
        .then(() => {
            finished = true;
            console.debug(`[startup] ${name} finished in ${Math.round(performance.now() - startedAt)}ms`);
        })
        .catch((error) => {
            finished = true;
            console.error(`[startup] ${name} failed`, error);
        })
        .finally(() => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        });

    const timeout = new Promise((resolve) => {
        timeoutId = setTimeout(() => {
            if (!finished) {
                console.warn(
                    `[startup] ${name} exceeded ${STARTUP_SOFT_TIMEOUT_MS}ms; continue rendering`
                );
            }
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
            console.warn(
                `[startup] React first commit not observed within ${STARTUP_COMMIT_TIMEOUT_MS}ms; removing loading overlay`
            );
            finish('timeout');
        }, STARTUP_COMMIT_TIMEOUT_MS);
    });
}

function renderApp() {
    const rootElement = document.getElementById('root');
    const loadingEl = document.getElementById('app-loading');
    const t0 = performance.now();
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

    waitForRootCommit(rootElement).then((reason) => {
        const elapsed = Math.round(performance.now() - t0);
        console.debug(`[startup] React first commit: ${elapsed}ms after bootstrap gate (${reason})`);
        hideStartupLoading(loadingEl);
    });
}

Promise.allSettled([
    settleStartupTask('initStore', () => initStore()),
    settleStartupTask('initEnv', () => initEnv()),
]).finally(() => {
    renderApp();
});
