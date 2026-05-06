import { getFlowGuideAuthPath } from './flowguide';
import { requestFlowGuide } from './flowguideApi';

const STORAGE_KEYS = {
    USER: 'auth_user',
    TOKEN: 'auth_token',
    REMEMBER_EMAIL: 'auth_remember_email',
    REMEMBER_PASSWORD: 'auth_remember_password',
    LANGUAGE_PREFERENCE: 'auth_language_preference',
};

function pickFirst(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
}

function getPayloadRoot(payload) {
    return payload?.data ?? payload?.result ?? payload ?? {};
}

function buildStoredUser(user, root = {}) {
    const source = user || root.user || root.account || root.profile || {};
    const email = pickFirst(source.email, root.email, root.userEmail);
    const id = pickFirst(source.id, source.user_id, source.userId, root.userId, root.sub, email);

    if (!id && !email) return null;

    return {
        id: String(id || email),
        email: email ? String(email) : '',
        display_name: String(
            pickFirst(
                source.display_name,
                source.displayName,
                source.name,
                source.username,
                source.nickname,
                root.username,
                email
            ) || ''
        ),
        avatar_url: pickFirst(source.avatar_url, source.avatarUrl, source.picture, root.avatarUrl) || '',
    };
}

function normalizeAuthPayload(payload, fallback = {}) {
    const root = getPayloadRoot(payload);
    const session = root.session || root.auth || {};
    const token = pickFirst(
        root.access_token,
        root.accessToken,
        root.token,
        root.jwt,
        root.apiToken,
        session.access_token,
        session.accessToken,
        session.token,
        session.jwt
    );
    const user = buildStoredUser(root.user || session.user, {
        ...fallback,
        ...root,
    });

    if (!user || !token) {
        throw new Error('FlowGuideAI did not return a valid user session.');
    }

    return {
        user,
        token: String(token),
        raw: payload,
    };
}

function persistStoredSession(user, token) {
    const storedUser = buildStoredUser(user);
    if (!storedUser || !token) return;
    localStorage.setItem(STORAGE_KEYS.TOKEN, String(token));
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(storedUser));
}

function clearStoredSession() {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
}

function encryptPassword(password) {
    if (!password) return '';
    const encoded = btoa(unescape(encodeURIComponent(password)));
    return encoded.split('').reverse().join('');
}

function decryptPassword(encrypted) {
    if (!encrypted) return '';
    try {
        const decoded = encrypted.split('').reverse().join('');
        return decodeURIComponent(escape(atob(decoded)));
    } catch {
        return '';
    }
}

async function postAuth(pathName, payload, options = {}) {
    const path = getFlowGuideAuthPath(pathName);
    return requestFlowGuide(path, {
        method: 'POST',
        body: payload,
        ...options,
    });
}

export async function loginWithPassword({ email, password, rememberMe = false }) {
    const normalizedEmail = String(email || '').trim();
    const payload = await postAuth('login', {
        email: normalizedEmail,
        password,
    });
    const result = normalizeAuthPayload(payload, { email: normalizedEmail });

    persistStoredSession(result.user, result.token);
    if (rememberMe) {
        localStorage.setItem(STORAGE_KEYS.REMEMBER_EMAIL, normalizedEmail);
        localStorage.setItem(STORAGE_KEYS.REMEMBER_PASSWORD, encryptPassword(password));
    } else {
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_EMAIL);
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_PASSWORD);
    }

    return result;
}

export async function registerWithEmail({ username, email, password, code, inviteCode = '' }) {
    const normalizedEmail = String(email || '').trim();
    const payload = await postAuth('register', {
        username,
        email: normalizedEmail,
        password,
        code,
        inviteCode,
    });

    try {
        const result = normalizeAuthPayload(payload, {
            email: normalizedEmail,
            username,
        });
        persistStoredSession(result.user, result.token);
        return result;
    } catch {
        return loginWithPassword({
            email: normalizedEmail,
            password,
            rememberMe: false,
        });
    }
}

export async function sendEmailCode({ email }) {
    return postAuth('sendCode', { email }, { query: { scene: 'register' } });
}

export async function sendResetCode({ email }) {
    return postAuth('sendCode', { email }, { query: { scene: 'reset' } });
}

export async function resetPassword({ email, code, password }) {
    return postAuth('resetPassword', { email, code, password });
}

export async function forgotPassword({ email }) {
    return sendResetCode({ email });
}

export async function logout() {
    const token = await getAccessToken();
    clearStoredSession();

    if (!token) return;
    try {
        await postAuth('logout', {}, { token });
    } catch {
        // Local logout must not be blocked by a best-effort remote session cleanup.
    }
}

export function getCurrentUser() {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!raw || !token) return { user: null, token: null };
    try {
        return { user: JSON.parse(raw), token };
    } catch {
        return { user: null, token: null };
    }
}

export async function getAccessToken() {
    return localStorage.getItem(STORAGE_KEYS.TOKEN) || null;
}

export async function requireAccessToken() {
    const token = await getAccessToken();
    if (!token) {
        throw new Error('Login expired. Please sign in again.');
    }
    return token;
}

export function getRememberedEmail() {
    return localStorage.getItem(STORAGE_KEYS.REMEMBER_EMAIL) || '';
}

export function getRememberedPassword() {
    const encrypted = localStorage.getItem(STORAGE_KEYS.REMEMBER_PASSWORD) || '';
    return decryptPassword(encrypted);
}

export function saveLanguagePreference(language) {
    localStorage.setItem(STORAGE_KEYS.LANGUAGE_PREFERENCE, language);
}

export function getLanguagePreference() {
    return localStorage.getItem(STORAGE_KEYS.LANGUAGE_PREFERENCE) || 'en';
}

export async function getMembershipProfile() {
    const { user } = getCurrentUser();
    if (!user) throw new Error('Not logged in');
    return {
        tier: user.membership_tier ?? 'free',
        status: user.membership_status ?? 'active',
        expiresAt: user.subscription_expires_at ?? null,
    };
}

export async function getPointsProfile() {
    const { user } = getCurrentUser();
    if (!user) throw new Error('Not logged in');
    return {
        balance: user.points_balance ?? 0,
        totalEarned: user.points_total_earned ?? 0,
    };
}
