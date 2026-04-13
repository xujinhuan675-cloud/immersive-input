import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { NextUIProvider } from '@nextui-org/react';
import ReactDOM from 'react-dom/client';
import React from 'react';

import { getLanguagePreference } from './utils/auth';
import AdminBillingPage from './web/AdminBillingPage';
import './style.css';
import i18n from './i18n';

const preferredLanguage = getLanguagePreference();
if (preferredLanguage) {
    i18n.changeLanguage(preferredLanguage).catch(() => {});
}

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);

root.render(
    <NextUIProvider>
        <NextThemesProvider attribute='class'>
            <AdminBillingPage />
        </NextThemesProvider>
    </NextUIProvider>
);
