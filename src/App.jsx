import { appWindow, currentMonitor } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { BrowserRouter } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { warn } from 'tauri-plugin-log-api';
import React, { useEffect } from 'react';
import { useTheme } from 'next-themes';

import Screenshot from './window/Screenshot';
import FloatToolbar from './window/FloatToolbar';
import InputAiHandle from './window/InputAiHandle';
import LightAI from './window/LightAI';
import Explain from './window/Explain';
import Chat from './window/Chat';
import Translate from './window/Translate';
import Recognize from './window/Recognize';
import Updater from './window/Updater';
import { store } from './utils/store';
import Config from './window/Config';
import Vault from './window/Vault';
import Phrases from './window/Phrases';
import PhrasesInline from './window/PhrasesInline';
import Login from './window/Login';
import AuthGuard from './components/AuthGuard';
import { useConfig } from './hooks';
import { applyAppFont, DEFAULT_APP_FONT_SIZE } from './utils/appFont';
import './style.css';
import './i18n';

// 需要认证的窗口列表
const authRequiredWindows = ['config', 'translate', 'light_ai', 'explain', 'chat', 'recognize', 'vault', 'phrases'];

const windowMap = {
    translate: <Translate />,
    float_toolbar: <FloatToolbar />,
    input_ai_handle: <InputAiHandle />,
    light_ai: <LightAI />,
    explain: <Explain />,
    chat: <Chat />,
    screenshot: <Screenshot />,
    recognize: <Recognize />,
    config: <Config />,
    updater: <Updater />,
    vault: <Vault />,
    phrases: <Phrases />,
    phrases_inline: <PhrasesInline />,
    login: <Login />,
};

const WINDOW_SIZE_MEMORY = {
    config: { width: true, height: true, minWidth: 800, minHeight: 400 },
    translate: { width: true, height: true },
    recognize: { width: true, height: true },
    light_ai: { width: true, height: true },
    explain: { width: true, height: true },
    chat: { width: true, height: true },
    vault: { width: true, height: true },
    updater: { width: true, height: true },
    phrases_inline: { width: true, height: false },
};

export default function App() {
    const [appTheme] = useConfig('app_theme', 'system');
    const [appLanguage] = useConfig('app_language', 'en');
    const [appFont] = useConfig('app_font', 'default');
    const { setTheme } = useTheme();
    const { i18n } = useTranslation();

    useEffect(() => {
        store.load();
    }, []);

    useEffect(() => {
        const onKeydown = async (e) => {
            const allowKeys = ['c', 'v', 'x', 'a', 'z', 'y'];
            if (e.ctrlKey && !allowKeys.includes(e.key.toLowerCase())) {
                e.preventDefault();
            }
            if (e.key.startsWith('F') && e.key.length > 1) {
                e.preventDefault();
            }
            if (e.key === 'Escape') {
                await appWindow.close();
            }
        };

        document.addEventListener('keydown', onKeydown);
        return () => {
            document.removeEventListener('keydown', onKeydown);
        };
    }, []);

    useEffect(() => {
        if (appTheme !== null) {
            if (appTheme !== 'system') {
                setTheme(appTheme);
            } else {
                try {
                    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                        setTheme('dark');
                    } else {
                        setTheme('light');
                    }
                    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                        if (e.matches) {
                            setTheme('dark');
                        } else {
                            setTheme('light');
                        }
                    });
                } catch {
                    warn("Can't detect system theme.");
                }
            }
        }
    }, [appTheme]);

    useEffect(() => {
        if (appLanguage !== null) {
            i18n.changeLanguage(appLanguage);
        }
    }, [appLanguage]);

    useEffect(() => {
        if (appFont !== null) {
            applyAppFont(appFont);
        }
        document.documentElement.style.fontSize = `${DEFAULT_APP_FONT_SIZE}px`;
    }, [appFont]);

    useEffect(() => {
        const memoryConfig = WINDOW_SIZE_MEMORY[appWindow.label];
        if (!memoryConfig) {
            return undefined;
        }

        let resizeTimeout = null;
        const unlistenResize = listen('tauri://resize', async () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }

            resizeTimeout = setTimeout(async () => {
                try {
                    const visible = await appWindow.isVisible();
                    if (!visible) {
                        return;
                    }

                    let size = await appWindow.outerSize();
                    const monitor = await currentMonitor();
                    const factor = monitor?.scaleFactor ?? 1;
                    size = size.toLogical(factor);
                    const roundedWidth = Math.round(size.width);
                    const roundedHeight = Math.round(size.height);

                    if (memoryConfig.minWidth && roundedWidth < memoryConfig.minWidth) {
                        return;
                    }
                    if (memoryConfig.minHeight && roundedHeight < memoryConfig.minHeight) {
                        return;
                    }

                    if (memoryConfig.width) {
                        await store.set(`${appWindow.label}_window_width`, roundedWidth);
                    }
                    if (memoryConfig.height) {
                        await store.set(`${appWindow.label}_window_height`, roundedHeight);
                    }
                    await store.save();
                } catch (_) {}
            }, 100);
        });

        return () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            unlistenResize.then((off) => off());
        };
    }, []);

    return (
        <BrowserRouter>
            {authRequiredWindows.includes(appWindow.label) ? (
                <AuthGuard showWelcome={appWindow.label === 'config'}>
                    {windowMap[appWindow.label]}
                </AuthGuard>
            ) : (
                windowMap[appWindow.label]
            )}
        </BrowserRouter>
    );
}
