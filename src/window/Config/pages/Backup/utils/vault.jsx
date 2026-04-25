import { open, save } from '@tauri-apps/api/dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/api/fs';

import { exportVaultPortableCsv, importVaultPortableCsv } from '../../../../Vault/vaultDb';

function buildDefaultFileName() {
    const date = new Date().toISOString().slice(0, 10);
    return `vault-${date}.csv`;
}

export async function exportVault() {
    const path = await save({
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        defaultPath: buildDefaultFileName(),
    });

    if (!path) {
        return null;
    }

    const csvText = await exportVaultPortableCsv();
    await writeTextFile(path, csvText);
    return path;
}

export async function importVault() {
    const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (!selected || Array.isArray(selected)) {
        return null;
    }

    const csvText = await readTextFile(selected);
    return importVaultPortableCsv(csvText);
}
