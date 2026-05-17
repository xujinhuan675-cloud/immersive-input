import { invoke } from '@tauri-apps/api';
import { join } from '@tauri-apps/api/path';
import { error, info, warn } from 'tauri-plugin-log-api';

import { store } from './store';
import { osType } from './env';

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_BACKUP_KEEP = 1;
const FREQUENCY_INTERVALS = {
    daily: DAY_MS,
    weekly: 7 * DAY_MS,
    monthly: 30 * DAY_MS,
};

const CONFIG_KEYS = {
    backupType: 'backup_type',
    webdavUrl: 'webdav_url',
    webdavUsername: 'webdav_username',
    webdavPassword: 'webdav_password',
    frequency: 'backup_auto_frequency',
    localDirectory: 'backup_local_directory',
    lastRunAt: 'backup_auto_last_run_at',
};

let started = false;
let running = false;

function pad(value) {
    return String(value).padStart(2, '0');
}

function getBackupName(date = new Date()) {
    return `${osType}-auto-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(
        date.getHours()
    )}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.zip`;
}

function isAutoBackupDue(config, now = Date.now()) {
    const interval = FREQUENCY_INTERVALS[config.frequency];
    if (!interval) {
        return false;
    }

    const lastRunAt = Number(config.lastRunAt);
    return !Number.isFinite(lastRunAt) || lastRunAt <= 0 || now - lastRunAt >= interval;
}

async function readAutoBackupConfig() {
    await store.load();
    const storedBackupType = (await store.get(CONFIG_KEYS.backupType)) || 'webdav';
    return {
        backupType: storedBackupType === 'aliyun' ? 'webdav' : storedBackupType,
        webdavUrl: (await store.get(CONFIG_KEYS.webdavUrl)) || '',
        webdavUsername: (await store.get(CONFIG_KEYS.webdavUsername)) || '',
        webdavPassword: (await store.get(CONFIG_KEYS.webdavPassword)) || '',
        frequency: (await store.get(CONFIG_KEYS.frequency)) || 'off',
        localDirectory: (await store.get(CONFIG_KEYS.localDirectory)) || '',
        lastRunAt: (await store.get(CONFIG_KEYS.lastRunAt)) || '',
    };
}

async function listLocal(directory) {
    const text = await invoke('local', {
        operate: 'list',
        path: directory,
    });
    return JSON.parse(text);
}

async function removeLocal(directory, name) {
    const path = await join(directory, name);
    await invoke('local', {
        operate: 'delete',
        path,
    });
}

async function putLocal(directory, name) {
    const path = await join(directory, name);
    await invoke('local', {
        operate: 'put',
        path,
    });
}

async function listWebdav(config) {
    const text = await invoke('webdav', {
        operate: 'list',
        url: config.webdavUrl,
        username: config.webdavUsername,
        password: config.webdavPassword,
    });
    return JSON.parse(text)
        .filter((item) => item.hasOwnProperty('File'))
        .map((file) => file.File.href.split('/').slice(-1)[0]);
}

async function putWebdav(config, name) {
    await invoke('webdav', {
        operate: 'put',
        url: config.webdavUrl,
        username: config.webdavUsername,
        password: config.webdavPassword,
        name,
    });
}

async function removeWebdav(config, name) {
    await invoke('webdav', {
        operate: 'delete',
        url: config.webdavUrl,
        username: config.webdavUsername,
        password: config.webdavPassword,
        name,
    });
}

async function pruneBackups(config) {
    let files = [];

    if (config.backupType === 'local') {
        files = await listLocal(config.localDirectory);
    } else {
        files = await listWebdav(config);
    }

    const backupFiles = files
        .filter((file) => String(file).includes('-auto-') && String(file).endsWith('.zip'))
        .sort();
    const removeCount = backupFiles.length - AUTO_BACKUP_KEEP;
    if (removeCount <= 0) {
        return;
    }

    const staleFiles = backupFiles.slice(0, removeCount);
    await Promise.all(
        staleFiles.map((file) =>
            config.backupType === 'local' ? removeLocal(config.localDirectory, file) : removeWebdav(config, file)
        )
    );
}

async function runBackup(config) {
    const name = getBackupName();
    if (config.backupType === 'local') {
        if (!config.localDirectory) {
            throw new Error('Auto backup local directory is not set.');
        }
        await putLocal(config.localDirectory, name);
    } else {
        if (!config.webdavUrl) {
            throw new Error('Auto backup WebDAV URL is not set.');
        }
        await putWebdav(config, name);
    }
    await pruneBackups(config);
}

async function checkAutoBackup() {
    if (running) {
        return;
    }

    running = true;
    try {
        const config = await readAutoBackupConfig();
        if (config.frequency === 'off') {
            return;
        }
        const now = Date.now();
        if (!isAutoBackupDue(config, now)) {
            return;
        }

        await runBackup(config);
        await store.set(CONFIG_KEYS.lastRunAt, now);
        await store.save();
        info(`Auto backup completed: ${new Date(now).toISOString()}`);
    } catch (e) {
        const message = e?.message || String(e);
        warn(`Auto backup failed: ${message}`);
        error(`Auto backup failed: ${message}`);
    } finally {
        running = false;
    }
}

export function startAutoBackupScheduler() {
    if (started) {
        return;
    }

    started = true;
    void checkAutoBackup();
}
