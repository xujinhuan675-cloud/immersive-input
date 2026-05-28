/**
 * Text formatter utility
 * Handles Chinese/English spacing, punctuation normalization, abbreviation capitalization
 */

export const FORMATTER_CONFIG_KEY = 'toolbar_format_options';

export const DEFAULT_FORMATTER_CONFIG = {
    normalizeWhitespace: true,
    repairLineBreaks: false,
    cjkSpacing: true,
    capitalizeAtCjkBoundary: true,
    normalizePunctuation: true,
    normalizeAbbreviations: true,
    cleanupSpaces: true,
};

export function getMergedFormatterConfig(config = {}) {
    if (!config || typeof config !== 'object') {
        return { ...DEFAULT_FORMATTER_CONFIG };
    }

    return {
        ...DEFAULT_FORMATTER_CONFIG,
        ...config,
    };
}

// Add spaces between Chinese and English/digit characters
function addCjkSpacing(text) {
    // Chinese followed by ASCII letter or digit
    text = text.replace(/([\u4e00-\u9fff\u3400-\u4dbf])([a-zA-Z0-9])/g, '$1 $2');
    // ASCII letter or digit followed by Chinese
    text = text.replace(/([a-zA-Z0-9])([\u4e00-\u9fff\u3400-\u4dbf])/g, '$1 $2');
    // Chinese followed by opening paren
    text = text.replace(/([\u4e00-\u9fff])\(/g, '$1 (');
    // Closing paren followed by Chinese
    text = text.replace(/\)([\u4e00-\u9fff])/g, ') $1');
    return text;
}

// Normalize whitespace: collapse multiple spaces, trim line ends
function normalizeWhitespace(text) {
    // Replace tabs and full-width spaces with a regular space
    text = text.replace(/[\t\u00A0\u3000]+/g, ' ');
    // Collapse multiple spaces
    text = text.replace(/ {2,}/g, ' ');
    // Trim each line
    const lines = text.split('\n').map((l) => l.trim());
    text = lines.join('\n');
    // Collapse 3+ consecutive newlines to 2
    text = text.replace(/\n{3,}/g, '\n\n');
    return text;
}

function shouldPreserveLineBreak(previousLine, nextLine) {
    const previous = String(previousLine || '').trim();
    const next = String(nextLine || '').trim();

    if (!previous || !next) {
        return true;
    }

    const structuralLineRe = /^(```|#{1,6}\s|>\s?|[-*+•]\s|\d+[.)]\s|\|)/;
    if (structuralLineRe.test(previous) || structuralLineRe.test(next)) {
        return true;
    }

    if (/[:：]$/.test(previous) && structuralLineRe.test(next)) {
        return true;
    }

    return false;
}

function joinWrappedLines(leftText, rightText) {
    const left = String(leftText || '').trimEnd();
    const right = String(rightText || '').trimStart();

    if (!left) return right;
    if (!right) return left;

    if (/-$/.test(left) && /^[a-z]/.test(right)) {
        return `${left.slice(0, -1)}${right}`;
    }

    if (/[\u4e00-\u9fff\u3400-\u4dbf]$/.test(left) && /^[\u4e00-\u9fff\u3400-\u4dbf]/.test(right)) {
        return `${left}${right}`;
    }

    if (/^[,.;:!?，。！？；：、）)\]}》」』]/.test(right)) {
        return `${left}${right}`;
    }

    return `${left} ${right}`;
}

function repairLineBreaks(text) {
    return text
        .split(/\n{2,}/)
        .map((paragraph) => {
            const lines = paragraph.split('\n');
            if (lines.length <= 1) {
                return paragraph;
            }

            return lines.reduce((result, line) => {
                if (!String(line || '').trim()) {
                    return result;
                }

                if (!String(result || '').trim()) {
                    return line.trim();
                }

                if (shouldPreserveLineBreak(result, line)) {
                    return `${result.trimEnd()}\n${line.trim()}`;
                }

                return joinWrappedLines(result, line);
            }, '');
        })
        .join('\n\n');
}

/**
 * Capitalize the first English letter of each non-CJK run that is adjacent to a CJK run.
 *
 * Examples (after addCjkSpacing has run):
 *   "hello world \u4f60\u597d"  \u2192  "Hello world \u4f60\u597d"
 *   "\u4f60\u597d hello world"  \u2192  "\u4f60\u597d Hello world"
 *   "hello \u4f60\u597d world"  \u2192  "Hello \u4f60\u597d World"
 *   "a b c \u4f60\u597d"         \u2192  "A b c \u4f60\u597d"
 */
function capitalizeAtCjkBoundary(text) {
    const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

    // Split into alternating CJK / non-CJK segments
    const segments = [];
    let buf = '';
    let lastWasCjk = null;
    for (const ch of text) {
        const isCjk = CJK_RE.test(ch);
        if (lastWasCjk !== null && isCjk !== lastWasCjk) {
            segments.push({ cjk: lastWasCjk, text: buf });
            buf = '';
        }
        buf += ch;
        lastWasCjk = isCjk;
    }
    if (buf.length) segments.push({ cjk: lastWasCjk ?? false, text: buf });

    // For each non-CJK segment adjacent to at least one CJK segment,
    // uppercase the first lowercase English letter in that segment.
    for (let i = 0; i < segments.length; i++) {
        if (!segments[i].cjk) {
            const adjPrev = i > 0 && segments[i - 1].cjk;
            const adjNext = i < segments.length - 1 && segments[i + 1].cjk;
            if (adjPrev || adjNext) {
                segments[i].text = segments[i].text.replace(/[a-z]/, (c) => c.toUpperCase());
            }
        }
    }

    return segments.map((s) => s.text).join('');
}

// Common tech abbreviations that should be uppercase
const ABBR_MAP = {
    '\\bai\\b': 'AI',
    '\\bui\\b': 'UI',
    '\\bapi\\b': 'API',
    '\\bid\\b': 'ID',
    '\\burl\\b': 'URL',
    '\\bhtml\\b': 'HTML',
    '\\bcss\\b': 'CSS',
    '\\bjson\\b': 'JSON',
    '\\bxml\\b': 'XML',
    '\\bsql\\b': 'SQL',
    '\\bok\\b': 'OK',
    '\\bsdk\\b': 'SDK',
    '\\bpc\\b': 'PC',
};

function normalizeAbbreviations(text) {
    for (const [pattern, replacement] of Object.entries(ABBR_MAP)) {
        text = text.replace(new RegExp(pattern, 'gi'), replacement);
    }
    // Capitalize standalone "i" as English pronoun
    text = text.replace(/\bi\b/g, 'I');
    return text;
}

// Convert punctuation based on preceding character context
function normalizePunctuation(text) {
    const result = [];
    let lastNonSpace = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === ' ') {
            result.push(c);
            continue;
        }
        const prevChinese = isChinese(lastNonSpace);
        const prevEnglish = isEnglish(lastNonSpace) || isDigit(lastNonSpace);
        let out = c;
        if (prevChinese) {
            // Use fullwidth punctuation after Chinese
            const map = { ',': '\uFF0C', '.': '\u3002', '!': '\uFF01', '?': '\uFF1F', ':': '\uFF1A', ';': '\uFF1B', '(': '\uFF08', ')': '\uFF09' };
            out = map[c] ?? c;
        } else if (prevEnglish) {
            // Use halfwidth punctuation after English
            const map = { '\uFF0C': ',', '\u3002': '.', '\uFF01': '!', '\uFF1F': '?', '\uFF1A': ':', '\uFF1B': ';', '\uFF08': '(', '\uFF09': ')' };
            out = map[c] ?? c;
        }
        result.push(out);
        lastNonSpace = c;
    }
    return result.join('');
}

// Remove spaces before punctuation marks
function cleanupSpaces(text) {
    // Remove space before fullwidth/halfwidth closing punctuation
    text = text.replace(/ +([,.\uFF0C\u3002!!\uFF01??\uFF1F::\uFF1A;;\uFF1B\)\uFF09\]])/g, '$1');
    // Remove space after opening brackets
    text = text.replace(/([(（\[]) +/g, '$1');
    // Ensure space after English punctuation before a word
    text = text.replace(/([,.:;!?])([a-zA-Z0-9])/g, '$1 $2');
    // No space after Chinese fullwidth punctuation before Chinese
    text = text.replace(/([\uFF0C\u3002\uFF01\uFF1F\uFF1A\uFF1B]) +([\u4e00-\u9fff])/g, '$1$2');
    // Collapse again
    text = text.replace(/ {2,}/g, ' ');
    return text;
}

function isChinese(c) {
    return c >= '\u4e00' && c <= '\u9fff';
}
function isEnglish(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}
function isDigit(c) {
    return c >= '0' && c <= '9';
}

/**
 * Main format function — applies all transformations in order
 * @param {string} input
 * @returns {string}
 */
export function formatText(input, config = DEFAULT_FORMATTER_CONFIG) {
    if (!input) return input;
    const mergedConfig = getMergedFormatterConfig(config);
    let result = input;
    if (mergedConfig.normalizeWhitespace) {
        result = normalizeWhitespace(result);
    }
    if (mergedConfig.repairLineBreaks) {
        result = repairLineBreaks(result);
    }
    if (mergedConfig.cjkSpacing) {
        result = addCjkSpacing(result);
    }
    if (mergedConfig.capitalizeAtCjkBoundary) {
        result = capitalizeAtCjkBoundary(result);
    }
    if (mergedConfig.normalizePunctuation) {
        result = normalizePunctuation(result);
    }
    if (mergedConfig.normalizeAbbreviations) {
        result = normalizeAbbreviations(result);
    }
    if (mergedConfig.cleanupSpaces) {
        result = cleanupSpaces(result);
    }
    return result;
}
