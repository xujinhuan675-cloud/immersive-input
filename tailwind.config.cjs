// tailwind.config.js
const { nextui } = require('@nextui-org/react');

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        // ...
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
        './node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        fontFamily: {
            sans: ['var(--app-font-family)'],
        },
        extend: {},
    },
    darkMode: 'class',
    plugins: [
        nextui({
            themes: {
                dark: {
                    colors: {
                        background: '#202020',
                        foreground: '#e7e7e7',
                        content1: '#282828',
                        content2: '#303030',
                        content3: '#383838',
                        content4: '#404040',
                        default: {
                            DEFAULT: '#484848',
                            50: '#282828',
                            100: '#383838',
                            200: '#484848',
                            300: '#585858',
                            400: '#686868',
                            500: '#a7a7a7',
                            600: '#b7b7b7',
                            700: '#c7c7c7',
                            800: '#d7d7d7',
                            900: '#e7e7e7',
                        },
                        primary: {
                            DEFAULT: '#49cee9',
                            foreground: '#181818',
                        },
                    },
                },
                light: {
                    colors: {
                        // 白色背景 rgb(255,255,255)
                        background: '#ffffff',
                        foreground: '#111827',
                        // 内容区域使用 rgb(249,250,251) 起步的灰度阶梯
                        content1: '#f9fafb',
                        content2: '#f3f4f6',
                        content3: '#e5e7eb',
                        content4: '#d1d5db',
                        default: {
                            DEFAULT: '#9ca3af',
                            50: '#f9fafb',
                            100: '#f3f4f6',
                            200: '#e5e7eb',
                            300: '#d1d5db',
                            400: '#9ca3af',
                            500: '#6b7280',
                            600: '#4b5563',
                            700: '#374151',
                            800: '#1f2937',
                            900: '#111827',
                        },
                        primary: {
                            foreground: '#ffffff',
                            DEFAULT: '#3578e5',
                        },
                    },
                },
            },
        }),
    ],
};
