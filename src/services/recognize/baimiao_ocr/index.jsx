import { fetch, Body } from '@tauri-apps/api/http';
import CryptoJS from 'crypto-js';

const BAIMIAO_BASE_URL = 'https://web.baimiaoapp.com';
const COMMON_HEADERS = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Origin: BAIMIAO_BASE_URL,
    Referer: `${BAIMIAO_BASE_URL}/`,
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

const sessionCache = new Map();

function createHeaders(uuid, token = '') {
    return {
        ...COMMON_HEADERS,
        'X-Auth-Uuid': uuid,
        'X-Auth-Token': token,
    };
}

async function login(username, password) {
    const uuid = crypto.randomUUID();
    const headers = createHeaders(uuid);
    const res = await fetch(`${BAIMIAO_BASE_URL}/api/user/login`, {
        method: 'POST',
        headers,
        body: Body.json({
            username,
            password,
            type: /^[0-9]*$/.test(username) ? 'mobile' : 'email',
        }),
    });

    if (!res.ok) {
        throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
    }

    const token = res.data?.data?.token;
    if (!token) {
        throw new Error(res.data?.message || 'Baimiao login failed');
    }

    const session = { uuid, token };
    sessionCache.set(username, session);
    return session;
}

async function ensureSession(username, password) {
    let session = sessionCache.get(username);
    if (!session) {
        session = await login(username, password);
    }

    let headers = createHeaders(session.uuid, session.token);
    await fetch(`${BAIMIAO_BASE_URL}/api/user/announcement`, {
        method: 'GET',
        headers,
    }).catch(() => {});

    const anonymousRes = await fetch(`${BAIMIAO_BASE_URL}/api/user/login/anonymous`, {
        method: 'POST',
        headers,
    });

    if (!anonymousRes.ok) {
        throw `Http Request Error\nHttp Status: ${anonymousRes.status}\n${JSON.stringify(anonymousRes.data)}`;
    }

    const anonymousToken = anonymousRes.data?.data?.token;
    if (anonymousToken === '') {
        session = await login(username, password);
    } else if (anonymousToken) {
        session = {
            uuid: session.uuid,
            token: anonymousToken,
        };
        sessionCache.set(username, session);
    }

    return {
        ...session,
        headers: createHeaders(session.uuid, session.token),
    };
}

export async function recognize(base64, _language, options = {}) {
    const { config } = options;
    const { username, password } = config;

    if (!username?.trim() || !password?.trim()) {
        throw new Error('Baimiao username and password are required');
    }

    const session = await ensureSession(username.trim(), password);
    const permRes = await fetch(`${BAIMIAO_BASE_URL}/api/perm/single`, {
        method: 'POST',
        headers: session.headers,
        body: Body.json({
            mode: 'single',
        }),
    });

    if (!permRes.ok) {
        throw `Http Request Error\nHttp Status: ${permRes.status}\n${JSON.stringify(permRes.data)}`;
    }

    const engine = permRes.data?.data?.engine;
    const token = permRes.data?.data?.token;
    if (!engine || !token) {
        throw new Error('Baimiao quota exhausted or account not ready');
    }

    const hash = CryptoJS.SHA1(`data:image/png;base64,${base64}`).toString(CryptoJS.enc.Hex);
    const createJobRes = await fetch(`${BAIMIAO_BASE_URL}/api/ocr/image/${engine}`, {
        method: 'POST',
        headers: session.headers,
        body: Body.json({
            batchId: '',
            total: 1,
            token,
            hash,
            name: 'pot_screenshot_cut.png',
            size: 0,
            dataUrl: `data:image/png;base64,${base64}`,
            result: {},
            status: 'processing',
            isSuccess: false,
        }),
    });

    if (!createJobRes.ok) {
        throw `Http Request Error\nHttp Status: ${createJobRes.status}\n${JSON.stringify(createJobRes.data)}`;
    }

    const jobStatusId = createJobRes.data?.data?.jobStatusId;
    if (!jobStatusId) {
        throw new Error(createJobRes.data?.message || 'Baimiao OCR job creation failed');
    }

    for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));

        const statusRes = await fetch(`${BAIMIAO_BASE_URL}/api/ocr/image/${engine}/status`, {
            method: 'GET',
            headers: session.headers,
            query: {
                jobStatusId,
            },
        });

        if (!statusRes.ok) {
            throw `Http Request Error\nHttp Status: ${statusRes.status}\n${JSON.stringify(statusRes.data)}`;
        }

        if (!statusRes.data?.data?.isEnded) {
            continue;
        }

        const words = statusRes.data?.data?.ydResp?.words_result ?? [];
        return words
            .map((item) => item.words)
            .filter(Boolean)
            .join('\n')
            .trim();
    }

    throw new Error('Baimiao OCR timeout');
}

export * from './Config';
export * from './info';
