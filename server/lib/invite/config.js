function parsePositiveInteger(value, fallback) {
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric > 0) {
        return numeric;
    }
    return fallback;
}

export function normalizeInviteCode(value, length = 8) {
    return String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase()
        .slice(0, Math.max(4, Number(length) || 8));
}

export function getInviteRuntimeConfig() {
    const codeLength = parsePositiveInteger(process.env.INVITE_CODE_LENGTH, 8);
    const inviterRewardCredits = parsePositiveInteger(
        process.env.INVITE_REFERRER_FIRST_PURCHASE_CREDITS || process.env.INVITE_REWARD_CREDITS,
        200
    );

    return {
        codeLength,
        inviterRewardCredits,
    };
}
