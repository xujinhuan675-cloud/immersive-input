import { invoke } from '@tauri-apps/api';

async function local_detect(text) {
    return await invoke('lang_detect', { text: text });
}

export default async function detect(text) {
    return await local_detect(text);
}
