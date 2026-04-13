// ISO-639-1 + Country Code (Option)
// https://zh.wikipedia.org/wiki/ISO_639-1%E4%BB%A3%E7%A0%81%E8%A1%A8
export const languageList = [
    'zh_cn',
    'zh_tw',
    'mn_mo',
    'en',
    'ja',
    'ko',
    'fr',
    'es',
    'ru',
    'de',
    'it',
    'tr',
    'pt_pt',
    'pt_br',
    'vi',
    'id',
    'th',
    'ms',
    'ar',
    'hi',
    'km',
    'mn_cy',
    'nb_no',
    'nn_no',
    'fa',
    'sv',
    'pl',
    'nl',
    'uk',
    'he',
];

// https://flagicons.lipis.dev/
export enum LanguageFlag {
    zh_cn = 'cn',
    zh_tw = 'tw',
    mn_mo = 'mo',
    en = 'gb',
    ja = 'jp',
    ko = 'kr',
    fr = 'fr',
    es = 'es',
    ru = 'ru',
    de = 'de',
    it = 'it',
    tr = 'tr',
    pt_pt = 'pt',
    pt_br = 'br',
    vi = 'vn',
    id = 'id',
    th = 'th',
    ms = 'ms',
    ar = 'arab',
    hi = 'in',
    km = 'kh',
    mn_cy = 'mn',
    nb_no = 'no',
    nn_no = 'no',
    fa = 'ir',
    sv = 'se',
    pl = 'pl',
    nl = 'nl',
    uk = 'ua',
    he = 'il',
}

const LANGUAGE_NORMALIZATION_MAP: Record<string, keyof typeof LanguageFlag> = {
    zh_cn: 'zh_cn',
    zh_hans: 'zh_cn',
    zh_tw: 'zh_tw',
    zh_hant: 'zh_tw',
    pt_pt: 'pt_pt',
    pt_br: 'pt_br',
    nb_no: 'nb_no',
    nn_no: 'nn_no',
    mn_mo: 'mn_mo',
    mn_cy: 'mn_cy',
    fa_ir: 'fa',
    uk_ua: 'uk',
    he_il: 'he',
};

const UNKNOWN_LANGUAGE_FLAG = 'xx';

export function normalizeLanguageKey(language?: string | null): string {
    if (!language) {
        return '';
    }

    const normalized = language.trim().toLowerCase().replace(/-/g, '_');
    return LANGUAGE_NORMALIZATION_MAP[normalized] ?? normalized;
}

export function getLanguageFlag(language?: string | null): string {
    const normalized = normalizeLanguageKey(language);

    if (!normalized) {
        return UNKNOWN_LANGUAGE_FLAG;
    }

    return LanguageFlag[normalized as keyof typeof LanguageFlag] ?? UNKNOWN_LANGUAGE_FLAG;
}
