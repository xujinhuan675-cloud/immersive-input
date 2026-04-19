import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';

function escapeCsvCell(value) {
    if (value === null || value === undefined) {
        return '';
    }

    let normalized = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Prevent spreadsheet apps from interpreting user content as formulas.
    if (/^[=+\-@]/.test(normalized)) {
        normalized = `'${normalized}`;
    }

    if (/[",\n]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }

    return normalized;
}

export async function exportTableCsv({ defaultFileName, columns, rows }) {
    const path = await save({
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        defaultPath: defaultFileName,
    });

    if (!path) {
        return null;
    }

    const headerLine = columns.map((column) => escapeCsvCell(column.header)).join(',');
    const bodyLines = rows.map((row) =>
        columns
            .map((column) => {
                const rawValue =
                    typeof column.value === 'function'
                        ? column.value(row)
                        : row?.[column.key];
                return escapeCsvCell(rawValue);
            })
            .join(',')
    );

    const csvText = `\uFEFF${[headerLine, ...bodyLines].join('\r\n')}`;
    await writeTextFile(path, csvText);
    return path;
}
