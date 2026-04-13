import React from 'react';
import 'flag-icons/css/flag-icons.min.css';

import { getLanguageFlag, normalizeLanguageKey } from '../utils/language';

function joinClassNames(...classNames) {
    return classNames.filter(Boolean).join(' ');
}

function getFallbackLabel(language, label) {
    if (label) {
        return label;
    }

    const normalized = normalizeLanguageKey(language);
    if (!normalized) {
        return '?';
    }

    return normalized.replace(/_/g, ' ').slice(0, 2).toUpperCase();
}

export default function LanguageFlagIcon({ language, className = '', fallbackClassName = '', label, title }) {
    const flagCode = getLanguageFlag(language);
    const accessibleTitle = title ?? language ?? '';

    if (flagCode === 'xx') {
        return (
            <span
                className={joinClassNames(
                    'inline-flex min-w-[1.75rem] items-center justify-center rounded bg-default-100 px-1 text-[10px] font-semibold uppercase text-default-600',
                    className,
                    fallbackClassName,
                )}
                title={accessibleTitle}
            >
                {getFallbackLabel(language, label)}
            </span>
        );
    }

    return (
        <span
            className={joinClassNames('fi inline-block shrink-0 align-middle rounded-sm', `fi-${flagCode}`, className)}
            aria-label={accessibleTitle}
            title={accessibleTitle}
        />
    );
}
