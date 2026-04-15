import { supabase } from './supabase';

/**
 * Auth 工具层
 *
 * 当前为 mock 实现，方便前端开发与测试。
 * 接入 Supabase 时，取消下方注释并替换 mock 逻辑即可。
 *
 * ── Supabase 接入准备 ──────────────────────────────────────────────
 * 1. pnpm add @supabase/supabase-js
 * 2. 在 .env 中配置:
 *      VITE_SUPABASE_URL=https://xxxx.supabase.co
 *      VITE_SUPABASE_ANON_KEY=your-anon-key
 * 3. 初始化客户端（取消下方注释）:
 *
 * import { createClient } from '@supabase/supabase-js';
 * export const supabase = createClient(
 *     import.meta.env.VITE_SUPABASE_URL,
 *     import.meta.env.VITE_SUPABASE_ANON_KEY
 * );
 *
 * ── 阿里云邮件验证码接入准备 ─────────────────────────────────────────
 * 验证码由你的后端服务生成并调用阿里云 DirectMail API 发送。
 * 前端只需调用你自己的后端接口（如 POST /api/email/send-code）。
 * 后端参考：https://help.aliyun.com/document_detail/29444.html
 * ─────────────────────────────────────────────────────────────────
 */

// ── 本地存储 key ────────────────────────────────────────────────────
const STORAGE_KEYS = {
    USER: 'auth_user',
    TOKEN: 'auth_token',
    REMEMBER_EMAIL: 'auth_remember_email',
    REMEMBER_PASSWORD: 'auth_remember_password',
    LANGUAGE_PREFERENCE: 'auth_language_preference',
};

function buildStoredUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.display_name || user.display_name || '',
    };
}

function persistStoredSession(user, token) {
    const storedUser = buildStoredUser(user);
    if (!storedUser || !token) return;
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(storedUser));
}

function clearStoredSession() {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
}

// 简单的加密/解密函数（使用 Base64 + 简单混淆）
// 注意：这不是强加密，只是防止明文存储
function encryptPassword(password) {
    if (!password) return '';
    const encoded = btoa(unescape(encodeURIComponent(password)));
    // 添加简单混淆
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

function getAuthApiBase() {
    const base = import.meta.env.VITE_AUTH_API_BASE;
    if (!base) return '';
    return String(base).replace(/\/$/, '');
}

async function postJson(path, payload) {
    const res = await fetch(`${getAuthApiBase()}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload ?? {}),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.message || '请求失败');
    }
    return data;
}

// ── 工具函数 ─────────────────────────────────────────────────────────
function delay(ms = 800) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 核心认证接口 ─────────────────────────────────────────────────────

/**
 * 密码登录
 * @param {{ email: string, password: string, rememberMe?: boolean }} payload
 * @returns {Promise<{ user: object, token: string }>}
 *
 * Supabase 替换方案:
 * const { data, error } = await supabase.auth.signInWithPassword({ email, password });
 * if (error) throw new Error(error.message);
 * return { user: data.user, token: data.session.access_token };
 */
export async function loginWithPassword({ email, password, rememberMe = false }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const user = data.user;
    const token = data.session?.access_token;
    if (!user || !token) {
        throw new Error('登录失败');
    }
    persistStoredSession(user, token);
    if (rememberMe) {
        localStorage.setItem(STORAGE_KEYS.REMEMBER_EMAIL, email);
        localStorage.setItem(STORAGE_KEYS.REMEMBER_PASSWORD, encryptPassword(password));
    } else {
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_EMAIL);
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_PASSWORD);
    }
    return { user, token };
}

/**
 * 邮箱注册
 * @param {{ username: string, email: string, password: string, code: string }} payload
 * @returns {Promise<{ user: object, token: string }>}
 *
 * Supabase 替换方案:
 * const { data, error } = await supabase.auth.signUp({
 *     email, password,
 *     options: { data: { display_name: username } }
 * });
 * if (error) throw new Error(error.message);
 * return { user: data.user, token: data.session?.access_token };
 */
export async function registerWithEmail({ username, email, password, code }) {
    await postJson('/api/auth/register', {
        username,
        email,
        password,
        code,
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const user = data.user;
    const token = data.session?.access_token;
    if (!user || !token) {
        throw new Error('登录失败');
    }
    persistStoredSession(user, token);
    return { user, token };
}

/**
 * 发送邮箱验证码
 * @param {{ email: string }} payload
 * @returns {Promise<void>}
 *
 * 阿里云 DirectMail 替换方案（调用你自己的后端接口）:
 * const res = await fetch('/api/email/send-code', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ email }),
 * });
 * if (!res.ok) throw new Error((await res.json()).message);
 */
export async function sendEmailCode({ email }) {
    const data = await postJson('/api/auth/send-code?scene=register', { email });
    return data;
}

/**
 * 发送密码重置验证码
 * @param {{ email: string }} payload
 * @returns {Promise<void>}
 */
export async function sendResetCode({ email }) {
    const data = await postJson('/api/auth/send-code?scene=reset', { email });
    return data;
}

/**
 * 重置密码
 * @param {{ email: string, code: string, password: string }} payload
 * @returns {Promise<void>}
 */
export async function resetPassword({ email, code, password }) {
    const data = await postJson('/api/auth/reset-password', { email, code, password });
    return data;
}

/**
 * 找回密码（发送重置邮件）
 * @param {{ email: string }} payload
 * @returns {Promise<void>}
 *
 * Supabase 替换方案:
 * const { error } = await supabase.auth.resetPasswordForEmail(email);
 * if (error) throw new Error(error.message);
 */
export async function forgotPassword({ email }) {
    // 使用自定义验证码方式，不使用 Supabase 的邮件链接
    const data = await sendResetCode({ email });
    return data;
}

/**
 * 退出登录
 *
 * Supabase 替换方案:
 * await supabase.auth.signOut();
 */
export async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    clearStoredSession();
    // 注意：不删除记住的邮箱和密码，以便下次登录使用
}

// ── 用户信息接口 ─────────────────────────────────────────────────────

/**
 * 获取当前已登录用户
 * @returns {{ user: object | null, token: string | null }}
 *
 * Supabase 替换方案:
 * const { data: { session } } = await supabase.auth.getSession();
 * return { user: session?.user ?? null, token: session?.access_token ?? null };
 */
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
    const storedToken = localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const session = data?.session || null;
        if (session?.access_token && session?.user) {
            persistStoredSession(session.user, session.access_token);
            return session.access_token;
        }
        clearStoredSession();
        return null;
    } catch {
        // fall back to the locally cached token when session refresh is unavailable
    }
    return storedToken || null;
}

export async function requireAccessToken() {
    const token = await getAccessToken();
    if (!token) {
        throw new Error('登录已过期，请重新登录');
    }
    return token;
}

/**
 * 获取已记住的邮箱
 * @returns {string}
 */
export function getRememberedEmail() {
    return localStorage.getItem(STORAGE_KEYS.REMEMBER_EMAIL) || '';
}

/**
 * 获取已记住的密码（解密后）
 * @returns {string}
 */
export function getRememberedPassword() {
    const encrypted = localStorage.getItem(STORAGE_KEYS.REMEMBER_PASSWORD) || '';
    return decryptPassword(encrypted);
}

/**
 * 保存语言偏好
 * @param {string} language - 语言代码（如 'en', 'zh_cn'）
 */
export function saveLanguagePreference(language) {
    localStorage.setItem(STORAGE_KEYS.LANGUAGE_PREFERENCE, language);
}

/**
 * 获取保存的语言偏好
 * @returns {string} 语言代码，如果没有保存则返回 'en'（默认英文）
 */
export function getLanguagePreference() {
    return localStorage.getItem(STORAGE_KEYS.LANGUAGE_PREFERENCE) || 'en';
}

// ── 扩展接口预留（会员 & 积分） ──────────────────────────────────────

/**
 * 获取会员信息
 * @returns {Promise<{ tier: string, status: string, expiresAt: string | null }>}
 *
 * 正式接入替换方案（调用后端接口或 Supabase 查询）:
 * const { data, error } = await supabase
 *     .from('user_profiles')
 *     .select('membership_tier, membership_status, subscription_expires_at')
 *     .eq('user_id', userId)
 *     .single();
 */
export async function getMembershipProfile() {
    await delay(300);
    const { user } = getCurrentUser();
    if (!user) throw new Error('未登录');
    return {
        tier: user.membership_tier ?? 'free',
        status: user.membership_status ?? 'active',
        expiresAt: user.subscription_expires_at ?? null,
    };
}

/**
 * 获取积分信息
 * @returns {Promise<{ balance: number, totalEarned: number }>}
 *
 * 正式接入替换方案（调用后端接口或 Supabase 查询）:
 * const { data, error } = await supabase
 *     .from('user_profiles')
 *     .select('points_balance, points_total_earned')
 *     .eq('user_id', userId)
 *     .single();
 */
export async function getPointsProfile() {
    await delay(300);
    const { user } = getCurrentUser();
    if (!user) throw new Error('未登录');
    return {
        balance: user.points_balance ?? 0,
        totalEarned: user.points_total_earned ?? 0,
    };
}
