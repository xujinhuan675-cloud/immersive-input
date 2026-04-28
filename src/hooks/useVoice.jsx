import { useCallback } from 'react';

const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
let audioContext = AudioContextConstructor ? new AudioContextConstructor() : null;
let source = null;
let currentUtterance = null;

function stopAudioPlayback() {
    if (!source) {
        return;
    }

    source.stop();
    source.disconnect();
    source = null;
}

function stopSystemSpeech() {
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') {
        return;
    }

    window.speechSynthesis.cancel();
    currentUtterance = null;
}

function stopCurrentPlayback() {
    stopAudioPlayback();
    stopSystemSpeech();
}

function isSystemSpeechPayload(data) {
    return Boolean(data && typeof data === 'object' && data.type === 'system_speech');
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

function speakWithSystemVoice(data) {
    if (
        typeof window === 'undefined' ||
        typeof window.speechSynthesis === 'undefined' ||
        typeof window.SpeechSynthesisUtterance === 'undefined'
    ) {
        throw new Error('System speech synthesis is not supported');
    }

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
    window.speechSynthesis.speak(utterance);
}

function decodeAudioData(buffer) {
    return new Promise((resolve, reject) => {
        audioContext.decodeAudioData(buffer, resolve, reject);
    });
}

async function playAudioBytes(data) {
    if (!audioContext) {
        throw new Error('Web Audio API is not supported');
    }

    await audioContext.resume?.();
    const audioBuffer = await decodeAudioData(new Uint8Array(data).buffer.slice(0));
    const nextSource = audioContext.createBufferSource();
    nextSource.buffer = audioBuffer;
    nextSource.connect(audioContext.destination);
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
        const speechSynthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;

        if (source || speechSynthesis?.speaking || speechSynthesis?.pending) {
            stopCurrentPlayback();
            return;
        }

        if (!data) {
            return;
        }

        if (isSystemSpeechPayload(data)) {
            speakWithSystemVoice(data);
            return;
        }

        playAudioBytes(data).catch(() => {
            stopAudioPlayback();
        });
    }, []);

    return playOrStop;
};
