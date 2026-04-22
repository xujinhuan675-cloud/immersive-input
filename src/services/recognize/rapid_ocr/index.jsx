import { invoke } from '@tauri-apps/api';

export async function recognize(base64, language) {
    return await invoke('rapid_ocr', { base64, language });
}

export * from './Config';
export * from './info';
