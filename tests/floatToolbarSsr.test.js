import assert from 'node:assert/strict';
import test from 'node:test';

import react from '@vitejs/plugin-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

function virtualFloatToolbarDeps() {
    const modules = new Map([
        [
            '@tauri-apps/api/fs',
            `
                export const BaseDirectory = { AppConfig: 'AppConfig' };
                export async function exists() { return false; }
                export async function readTextFile() { return ''; }
            `,
        ],
        [
            '@tauri-apps/api/event',
            `
                export async function listen() { return () => {}; }
                export async function emit() {}
            `,
        ],
        [
            '@tauri-apps/api/shell',
            `
                export async function open() {}
            `,
        ],
        [
            '@tauri-apps/api/tauri',
            `
                export async function invoke() { return ''; }
            `,
        ],
        [
            '@tauri-apps/api/window',
            `
                export class LogicalSize {
                    constructor(width, height) {
                        this.width = width;
                        this.height = height;
                    }
                }
                export const appWindow = {
                    label: 'float_toolbar',
                    hide: () => Promise.resolve(),
                    setSize: () => Promise.resolve(),
                };
            `,
        ],
        [
            'tauri-plugin-log-api',
            `
                export async function error() {}
            `,
        ],
        [
            'react-i18next',
            `
                export function useTranslation() {
                    return {
                        t: (_key, options = {}) => options.defaultValue || _key,
                    };
                }
            `,
        ],
        [
            'float:../../hooks/useConfig',
            `
                export function useConfig(_key, defaultValue) {
                    return [defaultValue, () => {}, () => defaultValue];
                }
            `,
        ],
        ['float:../../services/translate', 'export {};'],
        [
            'float:../../services/light_ai/openai',
            `
                export const STYLE_KEYS = ['natural'];
                export async function lightAiStream() { return ''; }
                export async function streamOpenAiMessages() { return ''; }
            `,
        ],
        [
            'float:../../utils/aiConfig',
            `
                export const AI_API_SERVICE_LIST_KEY = 'ai_api_service_list';
                export async function getActiveAiApiConfig() { return {}; }
                export function getAiHistoryServiceMeta() { return {}; }
            `,
        ],
        [
            'float:../../utils/aiHistory',
            `
                export async function saveHistory() {}
            `,
        ],
        [
            'float:../../utils/aiTranslate',
            `
                export function ensureAiTranslateBindings() {}
                export function getAiTranslateLanguageEnum() { return {}; }
                export function getLinkedAiServiceInstanceKey() { return ''; }
                export function getMergedAiTranslateConfig() { return {}; }
                export function isAiTranslateServiceKey() { return false; }
                export async function translateWithAiBinding() { return ''; }
            `,
        ],
        [
            'float:../../utils/formatter',
            `
                export const FORMATTER_CONFIG_KEY = 'formatter_config';
                export function formatText(text) { return text; }
            `,
        ],
        [
            'float:../../utils/invoke_plugin',
            `
                export async function invoke_plugin() { return ''; }
            `,
        ],
        [
            'float:../../utils/lang_detect',
            `
                export default function detect() { return 'auto'; }
            `,
        ],
        [
            'float:../../utils/service_instance',
            `
                export function getServiceName() { return 'mock'; }
                export function whetherPluginService() { return false; }
            `,
        ],
        [
            'float:../../utils/streamInput',
            `
                export async function streamTextToInput() {}
            `,
        ],
        [
            'float:../../utils/store',
            `
                export const store = {
                    async load() {},
                    async get() { return null; },
                    set() {},
                    save() {},
                };
            `,
        ],
        [
            'float:../../utils/todoNotebook',
            `
                export async function appendTodoItems() { return { count: 1, path: '' }; }
                export async function openTodoNotebook() { return ''; }
            `,
        ],
        [
            'float:../../utils/textSelectionToolbar',
            `
                import React from 'react';
                function MockIcon() {
                    return React.createElement('span', { 'data-icon': 'todo' });
                }
                export const TOOLBAR_BUTTON_ACTION_BEHAVIORS = {
                    WINDOW: 'window',
                    STREAM_APPLY: 'stream_apply',
                };
                export function normalizeToolbarButtonActionBehavior(value) {
                    return value || TOOLBAR_BUTTON_ACTION_BEHAVIORS.WINDOW;
                }
                export const SMART_TOOLBAR_CONFIG_KEY = 'smart_toolbar_button_options';
                export const DEFAULT_SMART_TOOLBAR_CONFIG = {};
                export const SMART_TOOLBAR_BUTTON_MAP = {};
                export const BASE_TOOLBAR_BUTTONS = [
                    {
                        id: 'todo',
                        cfgKey: 'toolbar_btn_todo',
                        fallbackLabel: 'Todo',
                        Icon: MockIcon,
                    },
                ];
                export function getToolbarButtonLabel(button) {
                    return button.fallbackLabel;
                }
            `,
        ],
        [
            'float:../../utils/textAnalyzer',
            `
                export function calculateExpr() { return null; }
                export function detectType() { return null; }
            `,
        ],
        [
            'float:../Config/pages/Service/servicePriority',
            `
                export const TRANSLATE_DEFAULT_VISIBLE = [];
            `,
        ],
    ]);
    for (const [key, value] of Array.from(modules)) {
        if (key.startsWith('float:../../')) {
            modules.set(key.slice('float:../../'.length), value);
        }
        if (key.startsWith('float:../')) {
            modules.set(key.slice('float:../'.length), value);
        }
    }

    return {
        name: 'virtual-float-toolbar-deps',
        enforce: 'pre',
        resolveId(source, importer) {
            if (modules.has(source)) {
                return `\0${source}`;
            }

            const normalizedImporter = String(importer || '').replace(/\\/g, '/');
            if (normalizedImporter.endsWith('/src/window/FloatToolbar/index.jsx')) {
                const scopedSource = `float:${source}`;
                if (modules.has(scopedSource)) {
                    return `\0${scopedSource}`;
                }
            }

            return null;
        },
        load(id) {
            if (!id.startsWith('\0')) {
                return null;
            }

            return modules.get(id.slice(1)) ?? null;
        },
    };
}

test('FloatToolbar renders in a mocked desktop shell', async (context) => {
    const originalWarn = console.warn;
    console.warn = (...args) => {
        if (String(args[0] || '').includes('react-i18next::')) {
            return;
        }
        originalWarn(...args);
    };
    context.after(() => {
        console.warn = originalWarn;
    });

    const server = await createServer({
        appType: 'custom',
        configFile: false,
        root: process.cwd(),
        server: {
            middlewareMode: true,
        },
        plugins: [virtualFloatToolbarDeps(), react()],
        ssr: {
            noExternal: [/^@tauri-apps\/api/, 'tauri-plugin-log-api'],
        },
    });
    context.after(() => server.close());

    const { default: FloatToolbar } = await server.ssrLoadModule('/src/window/FloatToolbar/index.jsx');
    const html = renderToStaticMarkup(React.createElement(FloatToolbar));

    assert.match(html, /aria-label="Todo"/);
    assert.match(html, /data-icon="todo"/);
});
