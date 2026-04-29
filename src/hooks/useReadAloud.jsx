import { useCallback, useEffect, useRef } from 'react';
import { error as logError, info as logInfo } from 'tauri-plugin-log-api';

import { synthesizeBuiltInTts } from '../services/tts/runtime';
import detect from '../utils/lang_detect';
import { normalizeLanguageKey } from '../utils/language';
import { useVoice } from './useVoice';

async function resolveLanguageKey(text) {
    try {
        return normalizeLanguageKey(await detect(text)) || 'auto';
    } catch {
        return 'auto';
    }
}

export const useReadAloud = () => {
    const speak = useVoice();
    const playTimeoutRef = useRef(null);

    useEffect(() => {
        return () => {
            if (playTimeoutRef.current) {
                clearTimeout(playTimeoutRef.current);
            }
        };
    }, []);

    return useCallback(
        async (text, languageKey = 'auto') => {
            const nextText = String(text || '').trim();
            if (!nextText) {
                return;
            }

            if (playTimeoutRef.current) {
                clearTimeout(playTimeoutRef.current);
                playTimeoutRef.current = null;
            }

            try {
                await logInfo(`[tts] read aloud requested (${nextText.length} chars)`).catch(() => {});
                speak();
                let nextLanguageKey = normalizeLanguageKey(languageKey) || 'auto';
                if (nextLanguageKey === 'auto') {
                    nextLanguageKey = await resolveLanguageKey(nextText);
                }
                await logInfo(`[tts] synthesize start (${nextLanguageKey})`).catch(() => {});
                const data = await synthesizeBuiltInTts(nextText, nextLanguageKey);
                await logInfo(`[tts] synthesize resolved (${data?.type || 'audio'})`).catch(() => {});

                playTimeoutRef.current = setTimeout(() => {
                    speak(data);
                    playTimeoutRef.current = null;
                }, 40);
            } catch (error) {
                await logError(`[tts] read aloud failed: ${error?.message || String(error)}`).catch(() => {});
                throw error;
            }
        },
        [speak]
    );
};
