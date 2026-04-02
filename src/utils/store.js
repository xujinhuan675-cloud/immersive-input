import { Store } from 'tauri-plugin-store-api';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { watch } from 'tauri-plugin-fs-watch-api';
import { invoke } from '@tauri-apps/api';

export let store = new Store();

export async function initStore() {
    const appConfigDirPath = await appConfigDir();
    const appConfigPath = await join(appConfigDirPath, 'config.json');
    store = new Store(appConfigPath);
    // 不阶塞等待 watcher 建立，避免多窗口同时 watch 同一文件时挂起导致 React 无法挂载
    watch(appConfigPath, async () => {
        await store.load();
        await invoke('reload_store');
    }).catch((e) => console.warn('[store] watch failed:', e));
}
