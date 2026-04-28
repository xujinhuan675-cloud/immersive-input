export async function tts(text, lang, options = {}) {
    const { config = {} } = options;

    return {
        type: 'system_speech',
        text,
        lang: lang === 'auto' ? '' : lang,
        voiceURI: String(config.voiceURI || '').trim(),
        rate: Number(config.rate ?? 1),
        pitch: Number(config.pitch ?? 1),
        volume: Number(config.volume ?? 1),
    };
}

export const Language = {
    auto: 'auto',
    zh_cn: 'zh-CN',
    zh_tw: 'zh-TW',
    ja: 'ja-JP',
    en: 'en-US',
    ko: 'ko-KR',
    fr: 'fr-FR',
    es: 'es-ES',
    ru: 'ru-RU',
    de: 'de-DE',
    it: 'it-IT',
    tr: 'tr-TR',
    pt_pt: 'pt-PT',
    pt_br: 'pt-BR',
    vi: 'vi-VN',
    id: 'id-ID',
    th: 'th-TH',
    ms: 'ms-MY',
    ar: 'ar-SA',
    hi: 'hi-IN',
    mn_cy: 'mn-MN',
    km: 'km-KH',
    nb_no: 'nb-NO',
    nn_no: 'nn-NO',
    fa: 'fa-IR',
    sv: 'sv-SE',
    pl: 'pl-PL',
    nl: 'nl-NL',
    uk: 'uk-UA',
    he: 'he-IL',
};
