import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';
import React, { useCallback, useEffect, useRef } from 'react';

import { useVoice } from '../../hooks';
import { synthesizeBuiltInTts } from '../../services/tts/runtime';
import detect from '../../utils/lang_detect';
import { normalizeLanguageKey } from '../../utils/language';

async function resolveLanguageKey(text) {
    try {
        return normalizeLanguageKey(await detect(text)) || 'auto';
    } catch {
        return 'auto';
    }
}

export default function TtsPlayer() {
    const speak = useVoice();
    const playTimeoutRef = useRef(null);

    const playText = useCallback(
        async (text) => {
            const nextText = String(text || '').trim();
            if (!nextText) {
                return;
            }

            const languageKey = await resolveLanguageKey(nextText);
            const data = await synthesizeBuiltInTts(nextText, languageKey);

            if (playTimeoutRef.current) {
                clearTimeout(playTimeoutRef.current);
            }

            speak();
            playTimeoutRef.current = setTimeout(() => {
                speak(data);
                playTimeoutRef.current = null;
            }, 40);
        },
        [speak]
    );

    useEffect(() => {
        appWindow.hide().catch(() => {});
    }, []);

    useEffect(() => {
        let disposed = false;

        async function consumePendingText() {
            const pendingText = await invoke('take_pending_tts_text').catch(() => '');
            if (disposed || !pendingText) {
                return;
            }

            try {
                await playText(pendingText);
            } catch (error) {
                console.error('play pending tts text failed:', error);
            }
        }

        void consumePendingText();

        const unlisten = listen('http_tts_text', (event) => {
            const payload = String(event.payload || '');
            void playText(payload).catch((error) => {
                console.error('play http tts text failed:', error);
            });
        });

        return () => {
            disposed = true;
            if (playTimeoutRef.current) {
                clearTimeout(playTimeoutRef.current);
            }
            void unlisten.then((off) => off());
        };
    }, [playText]);

    return null;
}
