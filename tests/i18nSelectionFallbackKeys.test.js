import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const LOCALE_DIR = path.resolve('src/i18n/locales');
const TARGET_LOCALES = ['en_US.json', 'zh_CN.json'];

const REQUIRED_KEYS = [
    'common.copy',
    'config.text_selection.smart.url.title',
    'config.text_selection.smart.url.match',
    'config.text_selection.smart.email.title',
    'config.text_selection.smart.email.match',
    'config.text_selection.smart.filepath.title',
    'config.text_selection.smart.filepath.match',
    'config.text_selection.smart.number.title',
    'config.text_selection.smart.number.match',
    'config.text_selection.smart.color.title',
    'config.text_selection.smart.color.match',
];

function readLocale(fileName) {
    const source = fs.readFileSync(path.join(LOCALE_DIR, fileName), 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(source).translation;
}

function getByPath(source, keyPath) {
    return keyPath.split('.').reduce((value, key) => value?.[key], source);
}

test('selection toolbar fallback labels have locale resources', () => {
    for (const locale of TARGET_LOCALES) {
        const translation = readLocale(locale);
        const missing = REQUIRED_KEYS.filter((key) => getByPath(translation, key) == null);

        assert.deepEqual(missing, [], `${locale} is missing locale keys`);
    }
});
