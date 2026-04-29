import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { appWindow } from '@tauri-apps/api/window';
import { error as logError, info as logInfo } from 'tauri-plugin-log-api';

const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
let audioContext = null;
let source = null;
let currentUtterance = null;
let nativeSpeechActive = false;
let nativeSpeechTimer = null;

function logPlaybackError(message, error) {
    const detail = error?.message || String(error);
    console.error(message, error);
    void logError(`[tts] ${message}: ${detail}`).catch(() => {});
}

function hasActivePlayback() {
    if (source || currentUtterance || nativeSpeechActive) {
        return true;
    }

    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') {
        return false;
    }

    return Boolean(window.speechSynthesis.speaking || window.speechSynthesis.pending);
}

function stopAudioPlayback() {
    if (!source) {
        return;
    }

    try {
        source.stop();
    } catch (_) {}

    try {
        source.disconnect();
    } catch (_) {}

    source = null;
}

function stopSystemSpeech() {
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') {
        return;
    }

    window.speechSynthesis.cancel();
    currentUtterance = null;
}

function stopNativeSpeech() {
    nativeSpeechActive = false;
    if (nativeSpeechTimer) {
        clearTimeout(nativeSpeechTimer);
        nativeSpeechTimer = null;
    }
    void invoke('stop_native_speech').catch(() => {});
}

function stopCurrentPlayback() {
    stopAudioPlayback();
    stopSystemSpeech();
    stopNativeSpeech();
}

export function stopAllVoicePlayback() {
    stopCurrentPlayback();
}

function isSystemSpeechPayload(data) {
    return Boolean(data && typeof data === 'object' && data.type === 'system_speech');
}

function isNativeSpeechPayload(data) {
    return Boolean(data && typeof data === 'object' && data.type === 'native_speech');
}

function clamp(value, min, max, fallback) {
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
        return fallback;
    }
    return Math.min(Math.max(numericValue, min), max);
}

function getVoiceCandidates(voices = []) {
    const localVoices = voices.filter((voice) => voice.localService !== false);
    return localVoices.length > 0 ? localVoices : voices;
}

function resolveSystemVoice(voiceURI, lang) {
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') {
        return null;
    }

    const voices = getVoiceCandidates(window.speechSynthesis.getVoices());
    if (!voices.length) {
        return null;
    }

    if (voiceURI) {
        const exactVoice = voices.find((voice) => voice.voiceURI === voiceURI);
        if (exactVoice) {
            return exactVoice;
        }
    }

    const normalizedLang = String(lang || '').trim().toLowerCase();
    if (!normalizedLang) {
        return voices[0];
    }

    return (
        voices.find((voice) => String(voice.lang || '').trim().toLowerCase() === normalizedLang) ||
        voices.find((voice) => String(voice.lang || '').trim().toLowerCase().startsWith(normalizedLang)) ||
        voices[0]
    );
}

function waitForSystemVoices(timeoutMs = 600) {
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') {
        return Promise.resolve([]);
    }

    const currentVoices = window.speechSynthesis.getVoices();
    if (currentVoices.length > 0) {
        return Promise.resolve(currentVoices);
    }

    return new Promise((resolve) => {
        const finalize = () => {
            cleanup();
            resolve(window.speechSynthesis.getVoices());
        };

        const cleanup = () => {
            clearTimeout(timer);
            window.speechSynthesis.removeEventListener?.('voiceschanged', finalize);
        };

        const timer = setTimeout(finalize, timeoutMs);
        window.speechSynthesis.addEventListener?.('voiceschanged', finalize);
    });
}

async function speakWithSystemVoice(data) {
    if (
        typeof window === 'undefined' ||
        typeof window.speechSynthesis === 'undefined' ||
        typeof window.SpeechSynthesisUtterance === 'undefined'
    ) {
        throw new Error('System speech synthesis is not supported');
    }

    await waitForSystemVoices();
    const utterance = new window.SpeechSynthesisUtterance(data.text || '');
    utterance.lang = data.lang || '';
    utterance.rate = clamp(data.rate, 0.5, 2, 1);
    utterance.pitch = clamp(data.pitch, 0, 2, 1);
    utterance.volume = clamp(data.volume, 0, 1, 1);

    const voice = resolveSystemVoice(data.voiceURI, utterance.lang);
    if (voice) {
        utterance.voice = voice;
        if (!utterance.lang) {
            utterance.lang = voice.lang || '';
        }
    }

    currentUtterance = utterance;
    utterance.onend = () => {
        if (currentUtterance === utterance) {
            currentUtterance = null;
        }
    };
    utterance.onerror = () => {
        if (currentUtterance === utterance) {
            currentUtterance = null;
        }
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.resume?.();
    window.setTimeout(() => {
        window.speechSynthesis.speak(utterance);
    }, 20);
}

async function speakWithNativeVoice(data) {
    const text = String(data.text || '').trim();
    if (!text) {
        return;
    }

    stopNativeSpeech();
    nativeSpeechActive = true;
    const estimatedDurationMs = Math.min(Math.max(text.length * 180, 1500), 120000);
    nativeSpeechTimer = setTimeout(() => {
        nativeSpeechActive = false;
        nativeSpeechTimer = null;
    }, estimatedDurationMs);

    await logInfo(`[tts] native speech start (${text.length} chars)`).catch(() => {});
    await invoke('speak_native_text', {
        text,
        rate: clamp(data.rate, 0.5, 2, 1),
        volume: clamp(data.volume, 0, 1, 1),
        ownerLabel: appWindow.label,
    });
}

function getAudioContext() {
    if (!AudioContextConstructor) {
        return null;
    }

    if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioContextConstructor();
    }

    return audioContext;
}

function toArrayBuffer(data) {
    if (data instanceof ArrayBuffer) {
        return data.slice(0);
    }

    if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }

    return new Uint8Array(data).buffer.slice(0);
}

function decodeAudioData(context, buffer) {
    return new Promise((resolve, reject) => {
        context.decodeAudioData(buffer, resolve, reject);
    });
}

function primePlayback() {
    const context = getAudioContext();
    if (context) {
        void context.resume?.().catch(() => {});
    }

    if (typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined') {
        window.speechSynthesis.resume?.();
    }

    void invoke('stop_native_speech').catch(() => {});
}

async function playAudioBytes(data) {
    const context = getAudioContext();
    if (!context) {
        throw new Error('Web Audio API is not supported');
    }

    await context.resume?.();
    const audioBuffer = await decodeAudioData(context, toArrayBuffer(data));
    const nextSource = context.createBufferSource();
    nextSource.buffer = audioBuffer;
    nextSource.connect(context.destination);
    source = nextSource;
    nextSource.start();
    nextSource.onended = () => {
        nextSource.disconnect();
        if (source === nextSource) {
            source = null;
        }
    };
}

export const useVoice = () => {
    const playOrStop = useCallback((data) => {
        const activePlayback = hasActivePlayback();
        if (activePlayback) {
            stopCurrentPlayback();
        }

        if (!data) {
            primePlayback();
            return;
        }

        if (isSystemSpeechPayload(data)) {
            void speakWithSystemVoice(data).catch((error) => {
                stopSystemSpeech();
                logPlaybackError('system speech playback failed', error);
            });
            return;
        }

        if (isNativeSpeechPayload(data)) {
            void speakWithNativeVoice(data).catch((error) => {
                stopNativeSpeech();
                logPlaybackError('native speech playback failed', error);
            });
            return;
        }

        const play = () =>
            playAudioBytes(data).catch((error) => {
                logPlaybackError('audio playback failed', error);
                stopAudioPlayback();
            });

        if (activePlayback) {
            window.setTimeout(play, 40);
            return;
        }

        play().catch(() => {
            stopAudioPlayback();
        });
    }, []);

    return playOrStop;
};

export const useStopVoiceOnUnmount = () => {
    useEffect(() => {
        const unlistenCloseRequested = listen('tauri://close-requested', () => {
            stopCurrentPlayback();
        });

        return () => {
            stopCurrentPlayback();
            void unlistenCloseRequested.then((off) => off()).catch(() => {});
        };
    }, []);
};
