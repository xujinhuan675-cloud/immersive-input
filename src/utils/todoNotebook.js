import { BaseDirectory, exists, readTextFile, writeTextFile } from '@tauri-apps/api/fs';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/api/shell';

const TODO_FILE_NAME = 'todo.txt';
const TODO_TITLE = '# Flow Input Todo';

function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function cleanTodoText(line) {
    return String(line ?? '')
        .trim()
        .replace(/^\s*\d+[.)]\s+\[[ xX]\]\s+/, '')
        .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '')
        .replace(/^\s*\[[ xX]\]\s+/, '')
        .replace(/^\s*[-*+]\s+/, '')
        .replace(/^\s*\d+[.)]\s+/, '')
        .trim();
}

export function normalizeTodoItems(text) {
    const normalized = String(text ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();

    if (!normalized) {
        return [];
    }

    return normalized
        .split('\n')
        .map(cleanTodoText)
        .filter(Boolean);
}

function formatTodoLines(todoItems, startAt = 1) {
    return todoItems.map((item, index) => `${startAt + index}. ${item}`);
}

function getNextTodoNumber(section) {
    const matches = Array.from(String(section ?? '').matchAll(/^\s*(\d+)[.)]\s+/gm));
    const lastNumber = matches.reduce((max, match) => Math.max(max, Number(match[1]) || 0), 0);
    return lastNumber + 1;
}

function appendUnderDateHeading(content, todoItems, dateKey = getLocalDateKey()) {
    const source = String(content ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const heading = `## ${dateKey}`;

    if (!source.trim()) {
        const nextLines = formatTodoLines(todoItems).join('\n');
        return `${TODO_TITLE}\n\n${heading}\n\n${nextLines}\n`;
    }

    const headingPattern = new RegExp(`^##\\s+${dateKey.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*$`, 'm');
    const headingMatch = source.match(headingPattern);

    if (headingMatch && headingMatch.index !== undefined) {
        const headingEnd = headingMatch.index + headingMatch[0].length;
        const rest = source.slice(headingEnd);
        const nextHeadingMatch = rest.match(/\n##\s+\d{4}-\d{2}-\d{2}\s*$/m);
        const insertAt = nextHeadingMatch?.index !== undefined ? headingEnd + nextHeadingMatch.index : source.length;
        const nextNumber = getNextTodoNumber(source.slice(headingEnd, insertAt));
        const nextLines = formatTodoLines(todoItems, nextNumber).join('\n');
        const before = source.slice(0, insertAt).trimEnd();
        const after = source.slice(insertAt).replace(/^\n+/, '');
        return after ? `${before}\n${nextLines}\n\n${after}` : `${before}\n${nextLines}\n`;
    }

    const titleMatch = source.match(/^#\s+.+$/m);
    if (titleMatch && titleMatch.index !== undefined) {
        const nextLines = formatTodoLines(todoItems).join('\n');
        const titleEnd = titleMatch.index + titleMatch[0].length;
        const before = source.slice(0, titleEnd).trimEnd();
        const after = source.slice(titleEnd).replace(/^\n+/, '');
        return after
            ? `${before}\n\n${heading}\n\n${nextLines}\n\n${after}`
            : `${before}\n\n${heading}\n\n${nextLines}\n`;
    }

    const nextLines = formatTodoLines(todoItems).join('\n');
    return `${TODO_TITLE}\n\n${heading}\n\n${nextLines}\n\n${source.trimStart()}`;
}

async function readTodoFile() {
    const hasFile = await exists(TODO_FILE_NAME, { dir: BaseDirectory.AppConfig }).catch(() => false);
    if (!hasFile) {
        return '';
    }

    return readTextFile(TODO_FILE_NAME, { dir: BaseDirectory.AppConfig }).catch(() => '');
}

export async function getTodoNotebookPath() {
    return join(await appConfigDir(), TODO_FILE_NAME);
}

function toFileUrl(path) {
    const normalizedPath = String(path || '').replace(/\\/g, '/');
    const filePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
    return encodeURI(`file://${filePath}`);
}

export async function appendTodoItems(text) {
    const todoLines = normalizeTodoItems(text);
    const path = await getTodoNotebookPath();

    if (todoLines.length === 0) {
        return { count: 0, path };
    }

    const currentContent = await readTodoFile();
    const nextContent = appendUnderDateHeading(currentContent, todoLines);
    await writeTextFile(TODO_FILE_NAME, nextContent, { dir: BaseDirectory.AppConfig });

    return { count: todoLines.length, path };
}

export async function openTodoNotebook() {
    const hasFile = await exists(TODO_FILE_NAME, { dir: BaseDirectory.AppConfig }).catch(() => false);
    if (!hasFile) {
        await writeTextFile(TODO_FILE_NAME, `${TODO_TITLE}\n\n## ${getLocalDateKey()}\n\n`, {
            dir: BaseDirectory.AppConfig,
        });
    }

    const path = await getTodoNotebookPath();
    await open(toFileUrl(path));
    return path;
}
