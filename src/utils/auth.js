import { getFlowGuideAuthPath } from './flowguide';
import { requestFlowGuide } from './flowguideApi';

const STORAGE_KEYS = {
    USER: 'auth_user',
    TOKEN: 'auth_token',
    REFRESH_TOKEN: 'auth_refresh_token',
    TOKEN_EXPIRES_AT: 'auth_token_expires_at',
    REMEMBER_EMAIL: 'auth_remember_email',
    REMEMBER_PASSWORD: 'auth_remember_password',
    LANGUAGE_PREFERENCE: 'auth_language_preference',
};

let refreshTokenPromise = null;

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
        username: pickFirst(source.username, root.username) || '',
        balance: pickFirst(source.balance, root.balance) ?? 0,
        role: pickFirst(source.role, root.role) || 'user',
        status: pickFirst(source.status, root.status) || '',
        subscriptions: source.subscriptions || root.subscriptions || [],
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

function mergeStoredUserPatch(currentUser, patch = {}) {
    if (!currentUser && !patch) return null;
    const source = patch || {};
    const email = pickFirst(source.email, currentUser?.email);
    const id = pickFirst(source.id, source.user_id, source.userId, currentUser?.id, email);
    if (!id && !email) return null;

    return {
        ...(currentUser || {}),
        id: String(id || email),
        email: email ? String(email) : currentUser?.email || '',
        username: pickFirst(source.username, currentUser?.username) || '',
        balance: pickFirst(source.balance, currentUser?.balance) ?? 0,
        role: pickFirst(source.role, currentUser?.role) || 'user',
        status: pickFirst(source.status, currentUser?.status) || '',
        subscriptions: source.subscriptions || currentUser?.subscriptions || [],
        display_name: String(
            pickFirst(
                source.display_name,
                source.displayName,
                source.name,
                source.username,
                source.nickname,
                currentUser?.display_name,
                currentUser?.displayName,
                currentUser?.name,
                currentUser?.username,
                email
            ) || ''
        ),
        avatar_url:
            pickFirst(source.avatar_url, source.avatarUrl, source.picture, currentUser?.avatar_url) || '',
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
    const refreshToken = pickFirst(root.refresh_token, root.refreshToken, session.refresh_token, session.refreshToken);
    const expiresIn = Number(pickFirst(root.expires_in, root.expiresIn, session.expires_in, session.expiresIn));
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
        refreshToken: refreshToken ? String(refreshToken) : '',
        expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null,
        raw: payload,
    };
}

function persistStoredSession(user, token, { refreshToken = '', expiresAt = null } = {}) {
    const storedUser = buildStoredUser(user);
    if (!storedUser || !token) return;
    localStorage.setItem(STORAGE_KEYS.TOKEN, String(token));
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(storedUser));
    if (refreshToken) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, String(refreshToken));
    if (expiresAt) localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES_AT, String(expiresAt));
}

function persistCurrentUser(user) {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const storedUser = buildStoredUser(user);
    if (!storedUser || !token) return null;
    const nextUser = {
        ...(user || {}),
        ...storedUser,
    };
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(nextUser));
    return nextUser;
}

function clearStoredSession() {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
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

    persistStoredSession(result.user, result.token, {
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
    });
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
    const normalizedInviteCode = String(inviteCode || '').trim();
    const payload = await postAuth('register', {
        email: normalizedEmail,
        password,
        verify_code: code,
        ...(normalizedInviteCode ? { aff_code: normalizedInviteCode } : {}),
    });

    try {
        const result = normalizeAuthPayload(payload, {
            email: normalizedEmail,
            username,
        });
        persistStoredSession(result.user, result.token, {
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt,
        });
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
    const result = await postAuth('sendCode', { email }, { query: { scene: 'register' } });
    return {
        ...result,
        cooldown_seconds: Number(result?.cooldown_seconds ?? result?.countdown ?? 60),
    };
}

export async function sendResetCode({ email }) {
    return postAuth('forgotPassword', { email });
}

export async function resetPassword({ email, code, password }) {
    return postAuth('resetPassword', { email, token: code, new_password: password });
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

export function updateCurrentUser(patch = {}) {
    const { user } = getCurrentUser();
    const nextUser = mergeStoredUserPatch(user, patch);
    if (!nextUser) return null;
    return persistCurrentUser(nextUser);
}

export async function refreshStoredUserProfile() {
    const token = await requireAccessToken();
    const payload = await requestFlowGuide('/api/v1/user/profile', { token });
    const root = getPayloadRoot(payload);
    return updateCurrentUser(root?.user || root?.account || root?.profile || root);
}

export async function getAccessToken() {
    return localStorage.getItem(STORAGE_KEYS.TOKEN) || null;
}

export async function refreshAccessToken() {
    if (refreshTokenPromise) return refreshTokenPromise;

    refreshTokenPromise = (async () => {
        const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
        if (!refreshToken) return null;

        try {
            const payload = await postAuth('refresh', {
                refresh_token: refreshToken,
                refreshToken,
            });
            const currentUser = getCurrentUser().user || {};
            const result = normalizeAuthPayload(payload, currentUser);
            persistStoredSession(result.user, result.token, {
                refreshToken: result.refreshToken || refreshToken,
                expiresAt: result.expiresAt,
            });
            return result.token;
        } catch (error) {
            if (error?.status === 401 || error?.status === 403) {
                clearStoredSession();
            }
            throw error;
        } finally {
            refreshTokenPromise = null;
        }
    })();

    return refreshTokenPromise;
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
