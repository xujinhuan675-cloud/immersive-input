import * as builtinTtsServices from '.';
import {
    BUILTIN_TTS_PROVIDER_IDS,
    ensureBuiltInTtsConfigMigration,
    getActiveReadAloudProviderId,
    getPreferredAiApiConfig,
    getResolvedBuiltInTtsConfig,
    getSelectedSpeechProviderId,
} from '../../utils/aiConfig';

function getFallbackProviderIds(config = {}) {
    const primaryProviderId = getActiveReadAloudProviderId(config);
    const selectedProviderId = getSelectedSpeechProviderId(config);
    const candidates = [primaryProviderId];

    if (selectedProviderId !== primaryProviderId) {
        candidates.push(selectedProviderId);
    }

    if (!candidates.includes(BUILTIN_TTS_PROVIDER_IDS.VOLCENGINE)) {
        candidates.push(BUILTIN_TTS_PROVIDER_IDS.VOLCENGINE);
    }
    if (!candidates.includes(BUILTIN_TTS_PROVIDER_IDS.OPENAI)) {
        candidates.push(BUILTIN_TTS_PROVIDER_IDS.OPENAI);
    }

    return candidates;
}

function isProviderConfigured(providerId, config = {}) {
    if (providerId === BUILTIN_TTS_PROVIDER_IDS.OPENAI) {
        return Boolean(String(config.apiKey || '').trim());
    }
    return Boolean(String(config.appid || '').trim() && String(config.accessToken || '').trim());
}

export async function synthesizeBuiltInTts(text, languageKey) {
    const [speechConfig, aiApiConfig] = await Promise.all([
        ensureBuiltInTtsConfigMigration(),
        getPreferredAiApiConfig({ includeDisabled: true }),
    ]);
    const providerIds = getFallbackProviderIds(speechConfig ?? {});
    const errors = [];

    for (const providerId of providerIds) {
        const service = builtinTtsServices[providerId];
        if (!service) {
            continue;
        }

        if (!(languageKey in service.Language)) {
            errors.push(`${providerId}: language not supported`);
            continue;
        }

        const providerConfig = getResolvedBuiltInTtsConfig(speechConfig ?? {}, providerId, aiApiConfig ?? null);
        if (!isProviderConfigured(providerId, providerConfig)) {
            errors.push(`${providerId}: configuration missing`);
            continue;
        }

        try {
            return await service.tts(text, service.Language[languageKey], {
                config: providerConfig,
            });
        } catch (error) {
            errors.push(`${providerId}: ${error?.message || String(error)}`);
        }
    }

    throw new Error(errors[0] || 'Built-in TTS is not configured');
}
