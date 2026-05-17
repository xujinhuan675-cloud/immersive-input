import { save, open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api';
import { join } from '@tauri-apps/api/path';

export async function backup() {
    const selected = await save({
        filters: [
            {
                name: 'Backup',
                extensions: ['zip'],
            },
        ],
    });
    if (selected === null) {
        return null;
    }
    return await invoke('local', {
        operate: 'put',
        path: selected,
    });
}

export async function backupToDirectory(directory, name) {
    if (!directory || !name) {
        throw 'Invalid Directory';
    }
    const fileName = name.endsWith('.zip') ? name : `${name}.zip`;
    const path = await join(directory, fileName);
    return await invoke('local', {
        operate: 'put',
        path,
    });
}

export async function list(directory) {
    if (!directory) {
        return [];
    }
    const backup_list_text = await invoke('local', {
        operate: 'list',
        path: directory,
    });
    return JSON.parse(backup_list_text);
}

export async function remove(directory, name) {
    const path = await join(directory, name);
    return await invoke('local', {
        operate: 'delete',
        path,
    });
}

export async function get() {
    const selected = await open({
        multiple: false,
        directory: false,
        filters: [
            {
                name: '*.zip',
                extensions: ['zip'],
            },
        ],
    });

    if (selected === null) {
        return null;
    }

    if (typeof selected === 'string' && selected.toLowerCase().endsWith('.zip')) {
        return await invoke('local', {
            operate: 'get',
            path: selected,
        });
    }

    throw 'Invalid File';
}
