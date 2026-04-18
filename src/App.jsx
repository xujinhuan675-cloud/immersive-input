import { appWindow } from '@tauri-apps/api/window';
import { BrowserRouter } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { warn } from 'tauri-plugin-log-api';
import React, { useEffect } from 'react';
import { useTheme } from 'next-themes';

import Screenshot from './window/Screenshot';
import FloatToolbar from './window/FloatToolbar';
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
