import React from 'react';
import { LuBot } from 'react-icons/lu';
import { SiAnthropic, SiGooglegemini, SiOpenai } from 'react-icons/si';

import { AI_PROVIDER_IDS, getAiProviderId } from '../utils/aiConfig';

const PROVIDER_ICON_MAP = {
    [AI_PROVIDER_IDS.OPENAI]: {
        Icon: SiOpenai,
        className: 'text-emerald-600',
    },
    [AI_PROVIDER_IDS.CLAUDE]: {
        Icon: SiAnthropic,
        className: 'text-orange-500',
    },
    [AI_PROVIDER_IDS.GEMINI]: {
        Icon: SiGooglegemini,
        className: 'text-sky-500',
    },
    [AI_PROVIDER_IDS.COMPATIBLE]: {
        Icon: LuBot,
        className: 'text-primary',
    },
};

export default function AiProviderIcon(props) {
    const { providerId, config, className = '' } = props;
    const resolvedProviderId = providerId ?? getAiProviderId(config);
    const providerMeta = PROVIDER_ICON_MAP[resolvedProviderId] ?? PROVIDER_ICON_MAP[AI_PROVIDER_IDS.COMPATIBLE];
    const Icon = providerMeta.Icon;

    return <Icon className={`${providerMeta.className} ${className}`.trim()} />;
}
