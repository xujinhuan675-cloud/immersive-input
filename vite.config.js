import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(async () => ({
    plugins: [react()],

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    // prevent vite from obscuring rust errors
    clearScreen: false,
    // tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
        headers: {
            'Cache-Control': 'no-store, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
        },
    },
    // to make use of `TAURI_DEBUG` and other env variables
    // https://tauri.studio/v1/api/config#buildconfig.beforedevcommand
    envPrefix: ['VITE_', 'TAURI_'],
    // Pre-bundle ESM-only packages so Vite can resolve them in dev mode
    optimizeDeps: {
        include: ['react-markdown', 'remark-gfm'],
    },
    build: {
        rollupOptions: {
            input: {
                index: resolve(__dirname, 'index.html'),
                daemon: resolve(__dirname, 'daemon.html'),
                adminBilling: resolve(__dirname, 'admin-billing.html'),
                landing: resolve(__dirname, 'landing.html'),
            },
            output: {
                manualChunks(id) {
                    const normalizedId = id.replace(/\\/g, '/');

                    if (!normalizedId.includes('/node_modules/')) {
                        if (normalizedId.includes('/src/window/Config/')) return 'window-config';
                        if (normalizedId.includes('/src/window/Translate/')) return 'window-translate';
                        if (normalizedId.includes('/src/window/Recognize/')) return 'window-recognize';
                        if (normalizedId.includes('/src/window/Vault/') || normalizedId.includes('/src/window/Phrases/')) {
                            return 'window-data';
                        }
                        return undefined;
                    }

                    if (
                        normalizedId.includes('/react-dom/') ||
                        normalizedId.includes('/react/') ||
                        normalizedId.includes('/scheduler/')
                    ) {
                        return 'vendor-react';
                    }
                    if (normalizedId.includes('/@react-aria/')) {
                        return 'vendor-aria';
                    }
                    if (normalizedId.includes('/@react-stately/')) {
                        return 'vendor-stately';
                    }
                    if (
                        normalizedId.includes('/@react-types/') ||
                        normalizedId.includes('/@internationalized/')
                    ) {
                        return 'vendor-intl';
                    }
                    if (
                        normalizedId.includes('/@nextui-org/') ||
                        normalizedId.includes('/framer-motion/') ||
                        normalizedId.includes('/@floating-ui/')
                    ) {
                        return 'vendor-ui';
                    }
                    if (normalizedId.includes('/next-themes/')) {
                        return 'vendor-theme';
                    }
                    if (normalizedId.includes('/i18next/') || normalizedId.includes('/react-i18next/')) {
                        return 'vendor-i18n';
                    }
                    if (normalizedId.includes('/react-router') || normalizedId.includes('/@remix-run/')) {
                        return 'vendor-router';
                    }
                    if (normalizedId.includes('/react-beautiful-dnd/')) {
                        return 'vendor-dnd';
                    }
                    if (normalizedId.includes('/@tauri-apps/') || normalizedId.includes('/tauri-plugin-')) {
                        return 'vendor-tauri';
                    }
                    if (
                        normalizedId.includes('/tesseract.js/') ||
                        normalizedId.includes('/pdf-lib/') ||
                        normalizedId.includes('/jsqr/')
                    ) {
                        return 'vendor-heavy';
                    }
                    if (normalizedId.includes('/react-icons/')) {
                        return 'vendor-icons';
                    }
                    if (normalizedId.includes('/react-markdown/') || normalizedId.includes('/remark-gfm/')) {
                        return 'vendor-markdown';
                    }
                    if (
                        normalizedId.includes('/@supabase/') ||
                        normalizedId.includes('/jose/') ||
                        normalizedId.includes('/pg/')
                    ) {
                        return 'vendor-backend';
                    }
                    if (
                        normalizedId.includes('/crypto-js/') ||
                        normalizedId.includes('/qrcode/') ||
                        normalizedId.includes('/pinyin-pro/') ||
                        normalizedId.includes('/md5/') ||
                        normalizedId.includes('/nanoid/') ||
                        normalizedId.includes('/uuid/')
                    ) {
                        return 'vendor-utils';
                    }
                    return 'vendor';
                },
            },
        },
        // Tauri supports es2021
        target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari11',
        // don't minify for debug builds
        minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
        // produce sourcemaps for debug builds
        sourcemap: !!process.env.TAURI_DEBUG,
    },
}));
