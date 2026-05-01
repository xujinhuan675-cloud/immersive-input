import { invoke } from '@tauri-apps/api/tauri';

const DEFAULT_FLUSH_MS = 40;
const DEFAULT_BUFFER_LIMIT = 24;
const DEFAULT_TEXT_CHUNK_SIZE = 10;
const DEFAULT_TEXT_CHUNK_DELAY_MS = 18;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createStreamInputWriter(options = {}) {
    const {
        flushMs = DEFAULT_FLUSH_MS,
        bufferLimit = DEFAULT_BUFFER_LIMIT,
        restoreFocus = true,
        selectAllOnFirstWrite = false,
    } = options;

    let bufferedText = '';
    let flushTimer = null;
    let processing = false;
    let shouldRestoreFocus = restoreFocus;
    let shouldSelectAllFirst = selectAllOnFirstWrite;
    let hasTypedContent = false;
    let queue = [];
    let failed = null;

    const clearFlushTimer = () => {
        if (flushTimer !== null) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
    };

    const processQueue = async () => {
        if (processing || failed) {
            return;
        }

        processing = true;
        try {
            while (queue.length > 0) {
                const nextText = queue.shift();
                if (!nextText) {
                    continue;
                }

                await invoke('stream_input_text', {
                    text: nextText,
                    restoreFocus: shouldRestoreFocus,
                    selectAllFirst: shouldSelectAllFirst,
                });
                shouldRestoreFocus = false;
                shouldSelectAllFirst = false;
                hasTypedContent = true;
            }
        } catch (error) {
            failed = error instanceof Error ? error : new Error(String(error));
        } finally {
            processing = false;
        }
    };

    const flushBufferedText = () => {
        clearFlushTimer();
        if (!bufferedText || failed) {
            return;
        }

        queue.push(bufferedText);
        bufferedText = '';
        void processQueue();
    };

    return {
        enqueue(chunk) {
            if (!chunk || failed) {
                return;
            }

            bufferedText += chunk;
            if (bufferedText.length >= bufferLimit || /[\r\n]/.test(chunk)) {
                flushBufferedText();
                return;
            }

            if (flushTimer === null) {
                flushTimer = setTimeout(() => {
                    flushTimer = null;
                    flushBufferedText();
                }, flushMs);
            }
        },

        async finish() {
            flushBufferedText();

            while (processing || queue.length > 0) {
                await delay(10);
            }

            if (failed) {
                throw failed;
            }
        },

        hasTyped() {
            return hasTypedContent;
        },
    };
}

export function createPartialAppliedError(error, writer) {
    const nextError = error instanceof Error ? error : new Error(String(error));
    nextError.partialApplied = Boolean(writer?.hasTyped?.());
    return nextError;
}

export function createCumulativeStreamInputAdapter(writer) {
    let previousText = '';

    return (value) => {
        if (typeof value !== 'string') {
            return;
        }

        const nextText = value.endsWith('_') ? value.slice(0, -1) : value;
        if (!nextText || nextText === previousText) {
            return;
        }

        if (!nextText.startsWith(previousText)) {
            previousText = nextText;
            return;
        }

        const delta = nextText.slice(previousText.length);
        previousText = nextText;
        writer.enqueue(delta);
    };
}

export async function streamTextToInput(text, options = {}) {
    const sourceText = String(text || '');
    const writer = createStreamInputWriter(options);
    const characters = Array.from(sourceText);
    const chunkSize = options.chunkSize ?? DEFAULT_TEXT_CHUNK_SIZE;
    const chunkDelayMs = options.chunkDelayMs ?? DEFAULT_TEXT_CHUNK_DELAY_MS;

    try {
        for (let index = 0; index < characters.length; index += chunkSize) {
            writer.enqueue(characters.slice(index, index + chunkSize).join(''));
            if (index + chunkSize < characters.length) {
                await delay(chunkDelayMs);
            }
        }

        await writer.finish();
    } catch (error) {
        throw createPartialAppliedError(error, writer);
    }

    return sourceText;
}
