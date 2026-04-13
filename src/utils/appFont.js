export const DEFAULT_APP_FONT_STACK =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';

export const APP_FONT_CSS_VAR = '--app-font-family';
export const APP_FONT_FAMILY_VAR = 'var(--app-font-family)';

const PRIORITY_FONT_FAMILIES = [
    'Microsoft YaHei UI',
    'Microsoft YaHei',
    'PingFang SC',
    'Hiragino Sans GB',
    'Source Han Sans SC',
    'Noto Sans CJK SC',
    'Noto Sans SC',
    'DengXian',
    'SimSun',
    'NSimSun',
    'SimHei',
    'KaiTi',
    'FangSong',
    'Source Han Serif SC',
    'Noto Serif CJK SC',
    'Noto Serif SC',
    'Segoe UI',
    'Segoe UI Variable',
    'Arial',
    'Calibri',
    'Helvetica Neue',
    'Helvetica',
    'Verdana',
    'Tahoma',
    'Trebuchet MS',
    'Georgia',
    'Times New Roman',
    'Cambria',
    'Consolas',
    'Courier New',
    'Arial Unicode MS',
];

const EXCLUDED_FONT_FAMILIES = new Set([
    'Bookshelf Symbol 7',
    'Marlett',
    'MT Extra',
    'Segoe Fluent Icons',
    'Segoe MDL2 Assets',
    'Symbol',
    'Webdings',
    'Wingdings',
    'Wingdings 2',
    'Wingdings 3',
]);

const EXCLUDED_FONT_PATTERNS = [/^@/, /^\./, /\bemoji\b/i, /\bicons?\b/i, /\bassets\b/i];

const CHINESE_FONT_KEYWORDS = [
    'yahei',
    'dengxian',
    'simsun',
    'simhei',
    'kaiti',
    'fangsong',
    'songti',
    'heiti',
    'pingfang',
    'hiragino sans gb',
    'source han',
    'noto sans cjk',
    'noto serif cjk',
    'noto sans sc',
    'noto serif sc',
    'sarasa',
    'wenquanyi',
    'lxgw',
    'harmonyos sans',
    'smiley sans',
    'alibaba puhui',
    'misans',
    'mi sans',
    'oppo sans',
];

const PRIORITY_FONT_INDEX = new Map(
    PRIORITY_FONT_FAMILIES.map((fontName, index) => [fontName.toLowerCase(), index]),
);

function normalizeFontName(fontName) {
    return typeof fontName === 'string' ? fontName.trim() : '';
}

function shouldExcludeFont(fontName) {
    const normalized = normalizeFontName(fontName);
    if (!normalized) {
        return true;
    }

    if (EXCLUDED_FONT_FAMILIES.has(normalized)) {
        return true;
    }

    return EXCLUDED_FONT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildAppFontStack(fontName) {
    if (!fontName || fontName === 'default') {
        return DEFAULT_APP_FONT_STACK;
    }

    return `"${fontName}", ${DEFAULT_APP_FONT_STACK}`;
}

export function applyAppFont(fontName) {
    const stack = buildAppFontStack(fontName);

    if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty(APP_FONT_CSS_VAR, stack);
        document.documentElement.style.fontFamily = stack;
        if (document.body) {
            document.body.style.fontFamily = stack;
        }
    }

    return stack;
}

export function isChineseCapableFont(fontName) {
    const normalized = normalizeFontName(fontName);
    const lowerCaseName = normalized.toLowerCase();

    if (!normalized) {
        return false;
    }

    if (/[\u3400-\u9fff]/.test(normalized)) {
        return true;
    }

    return CHINESE_FONT_KEYWORDS.some((keyword) => lowerCaseName.includes(keyword));
}

function compareFontNames(leftFont, rightFont) {
    const leftPriority = PRIORITY_FONT_INDEX.get(leftFont.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = PRIORITY_FONT_INDEX.get(rightFont.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;

    if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
    }

    const leftChineseCapable = isChineseCapableFont(leftFont) ? 0 : 1;
    const rightChineseCapable = isChineseCapableFont(rightFont) ? 0 : 1;

    if (leftChineseCapable !== rightChineseCapable) {
        return leftChineseCapable - rightChineseCapable;
    }

    return leftFont.localeCompare(rightFont, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
}

export function getCuratedFontList(fontList, currentFont) {
    if (!Array.isArray(fontList)) {
        return [];
    }

    const installedFonts = [];
    const seenFonts = new Set();

    fontList.forEach((fontName) => {
        const normalized = normalizeFontName(fontName);
        if (!normalized || seenFonts.has(normalized)) {
            return;
        }

        seenFonts.add(normalized);
        installedFonts.push(normalized);
    });

    const curated = installedFonts.filter((fontName) => !shouldExcludeFont(fontName)).sort(compareFontNames);
    const normalizedCurrentFont = normalizeFontName(currentFont);

    if (
        normalizedCurrentFont &&
        normalizedCurrentFont !== 'default' &&
        seenFonts.has(normalizedCurrentFont) &&
        !curated.includes(normalizedCurrentFont)
    ) {
        curated.unshift(normalizedCurrentFont);
    }

    return curated;
}
