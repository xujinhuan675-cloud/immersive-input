import { emit } from '@tauri-apps/api/event';

import { appVersion } from './env';
import { store } from './store';

export const UPDATE_REMINDER_KEYS = {
    updateAvailable: 'pending_update_available',
    updateVersion: 'pending_update_version',
    restartReady: 'pending_update_restart',
};

function parseVersion(version) {
    return String(version || '')
        .split('.')
        .map((part) => Number.parseInt(part, 10))
        .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(left, right) {
    const leftParts = parseVersion(left);
    const rightParts = parseVersion(right);
    const length = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < length; index += 1) {
        const leftPart = leftParts[index] ?? 0;
        const rightPart = rightParts[index] ?? 0;

        if (leftPart > rightPart) return 1;
        if (leftPart < rightPart) return -1;
    }

    return 0;
}

async function emitUpdateReminderChanged() {
    await emit('update_reminder_changed');
}

export async function clearUpdateReminder() {
    await store.set(UPDATE_REMINDER_KEYS.updateAvailable, false);
    await store.set(UPDATE_REMINDER_KEYS.updateVersion, '');
    await store.set(UPDATE_REMINDER_KEYS.restartReady, false);
    await store.save();
    await emitUpdateReminderChanged();
}

export async function markUpdateAvailable(version = '') {
    const normalizedVersion = String(version || '').trim();

    await store.set(UPDATE_REMINDER_KEYS.updateAvailable, true);
    if (normalizedVersion) {
        await store.set(UPDATE_REMINDER_KEYS.updateVersion, normalizedVersion);
    }
    await store.save();
    await emitUpdateReminderChanged();
}

export async function markUpdateRestartReady(version = '') {
    const normalizedVersion = String(version || '').trim();

    await store.set(UPDATE_REMINDER_KEYS.updateAvailable, true);
    await store.set(UPDATE_REMINDER_KEYS.restartReady, true);
    if (normalizedVersion) {
        await store.set(UPDATE_REMINDER_KEYS.updateVersion, normalizedVersion);
    }
    await store.save();
    await emitUpdateReminderChanged();
}

export async function getUpdateReminderState() {
    const restartReady = Boolean(await store.get(UPDATE_REMINDER_KEYS.restartReady));
    const updateAvailable = Boolean(await store.get(UPDATE_REMINDER_KEYS.updateAvailable));
    const updateVersion = String((await store.get(UPDATE_REMINDER_KEYS.updateVersion)) || '').trim();

    return {
        hasReminder: restartReady || updateAvailable,
        restartReady,
        updateAvailable,
        updateVersion,
    };
}

export async function clearResolvedUpdateReminder(currentVersion = appVersion) {
    const state = await getUpdateReminderState();
    if (!state.hasReminder || !state.updateVersion || !currentVersion) return state;

    if (compareVersions(currentVersion, state.updateVersion) >= 0) {
        await clearUpdateReminder();
        return {
            hasReminder: false,
            restartReady: false,
            updateAvailable: false,
            updateVersion: '',
        };
    }

    return state;
}
