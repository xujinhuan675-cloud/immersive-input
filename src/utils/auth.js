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
};

// ── Mock 用户数据库（仅开发阶段使用） ───────────────────────────────
const MOCK_USERS = [
    {
        id: 'mock-user-001',
        email: 'demo@example.com',
        display_name: 'Demo User',
        password: 'Demo@123456',
        membership_tier: 'free',
        membership_status: 'active',
        points_balance: 100,
        points_total_earned: 100,
        subscription_expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
];

// ── 工具函数 ─────────────────────────────────────────────────────────
function delay(ms = 800) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockToken(userId) {
    return `mock_token_${userId}_${Date.now()}`;
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
    await delay();
    const user = MOCK_USERS.find((u) => u.email === email && u.password === password);
    if (!user) {
        throw new Error('邮箱或密码错误');
    }
    const { password: _, ...safeUser } = user;
    const token = mockToken(user.id);
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(safeUser));
    if (rememberMe) {
        localStorage.setItem(STORAGE_KEYS.REMEMBER_EMAIL, email);
    } else {
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_EMAIL);
    }
    return { user: safeUser, token };
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
    await delay();
    // Mock 验证码校验（正式接入后由后端校验）
    if (code !== '123456') {
        throw new Error('验证码错误');
    }
    const exists = MOCK_USERS.find((u) => u.email === email);
    if (exists) {
        throw new Error('该邮箱已被注册');
    }
    const newUser = {
        id: `mock-user-${Date.now()}`,
        email,
        display_name: username,
        // 预留会员与积分字段
        membership_tier: 'free',
        membership_status: 'active',
        points_balance: 0,
        points_total_earned: 0,
        subscription_expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    MOCK_USERS.push({ ...newUser, password });
    const token = mockToken(newUser.id);
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser));
    return { user: newUser, token };
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
    await delay(600);
    if (!email || !email.includes('@')) {
        throw new Error('请输入有效的邮箱地址');
    }
    // Mock: 固定验证码 123456，控制台提示
    console.log(`[Mock] 验证码已发送至 ${email}，固定验证码: 123456`);
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
    await delay();
    if (!email || !email.includes('@')) {
        throw new Error('请输入有效的邮箱地址');
    }
    console.log(`[Mock] 密码重置邮件已发送至 ${email}`);
}

/**
 * 退出登录
 *
 * Supabase 替换方案:
 * await supabase.auth.signOut();
 */
export async function logout() {
    await delay(200);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
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

/**
 * 获取已记住的邮箱
 * @returns {string}
 */
export function getRememberedEmail() {
    return localStorage.getItem(STORAGE_KEYS.REMEMBER_EMAIL) || '';
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
