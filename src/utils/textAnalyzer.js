/**
 * Text type detector — ported from C# TextAnalyzer
 * Detects: url, email, filepath, number, color, english, text
 */

const URL_RE    = /^(https?:\/\/|www\.)[^\s]+$/i;
const EMAIL_RE  = /^[\w.+-]+@[\w.-]+\.\w{2,}$/i;
const PATH_RE   = /^[a-zA-Z]:\\[^<>:"/|?*]+/;
const NUMBER_RE = /^[\d\s\t\n\r.+\-*/()（）×÷%=]+$/;
const COLOR_RE  = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$|^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i;

/** Detect the primary type of a text snippet. */
export function detectType(text) {
    const t = (text || '').trim();
    if (!t) return 'text';
    if (URL_RE.test(t))    return 'url';
    if (EMAIL_RE.test(t))  return 'email';
    if (PATH_RE.test(t))   return 'filepath';
    if (COLOR_RE.test(t))  return 'color';
    if (NUMBER_RE.test(t) && t.length <= 200) return 'number';
    if (isEnglish(t))      return 'english';
    return 'text';
}

/** Evaluate a simple math expression safely. Returns null on error. */
export function calculateExpr(expr) {
    try {
        let cleaned = expr
            .replace(/[（]/g, '(').replace(/[）]/g, ')')
            .replace(/×/g, '*').replace(/÷/g, '/')
            .replace(/\s+/g, '')
            .replace(/=+$/, '')
            .trim();
        // Only allow safe math characters
        if (!/^[\d.+\-*/()%^]+$/.test(cleaned)) return null;
        // Use Function instead of eval for slightly better isolation
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict"; return (' + cleaned + ')')();
        if (typeof result !== 'number' || !isFinite(result)) return null;
        // Format: avoid scientific notation for reasonable numbers
        return Number.isInteger(result) ? String(result) : result.toPrecision(10).replace(/\.?0+$/, '');
    } catch {
        return null;
    }
}

/** Return true if text is predominantly English letters. */
export function isEnglish(text) {
    if (!text || text.trim().length < 2) return false;
    let eng = 0, letters = 0;
    for (const c of text) {
        if (/[a-zA-Z]/.test(c)) { eng++; letters++; }
        else if (/\p{L}/u.test(c)) letters++; // other Unicode letter
    }
    return letters > 0 && eng / letters > 0.7;
}
