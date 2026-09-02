const DEFAULT_TAG_TRANSLATION_KEYS = Object.freeze({
    地址: 'phrases.default_tags.address',
    问候: 'phrases.default_tags.greeting',
    工作: 'phrases.default_tags.work',
    回复: 'phrases.default_tags.reply',
    签名: 'phrases.default_tags.signature',
    联系方式: 'phrases.default_tags.contact',
    个人信息: 'phrases.default_tags.personal',
});

/**
 * Default tags are persisted with stable Chinese names for backwards
 * compatibility. Resolve those names at render time so the UI follows the
 * selected language while user-created/renamed tags remain unchanged.
 */
export function getPhraseTagLabel(tag, t) {
    const name = String(tag?.name ?? '');
    const translationKey = DEFAULT_TAG_TRANSLATION_KEYS[name];

    if (!translationKey || typeof t !== 'function') {
        return name;
    }

    return t(translationKey, { defaultValue: name });
}
