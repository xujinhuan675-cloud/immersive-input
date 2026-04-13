const ADMIN_TOKEN_STORAGE_KEY = 'payment_admin_token';

function getStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
}

export function getStoredAdminToken() {
    const storage = getStorage();
    if (!storage) return '';
    return String(storage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '').trim();
}

export function saveStoredAdminToken(token) {
    const storage = getStorage();
    const value = String(token || '').trim();
    if (!storage) return value;
    if (value) {
        storage.setItem(ADMIN_TOKEN_STORAGE_KEY, value);
    } else {
        storage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
    return value;
}

export function clearStoredAdminToken() {
    const storage = getStorage();
    storage?.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}
