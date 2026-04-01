/**
 * Text formatter utility
 * Handles Chinese/English spacing, punctuation normalization, abbreviation capitalization
 */

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
export function formatText(input) {
    if (!input) return input;
    let result = input;
    result = normalizeWhitespace(result);
    result = addCjkSpacing(result);
    result = normalizePunctuation(result);
    result = normalizeAbbreviations(result);
    result = cleanupSpaces(result);
    return result;
}
