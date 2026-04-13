import { getAccessToken } from './auth';

function getApiBase() {
    const base = String(import.meta.env.VITE_AUTH_API_BASE || '').trim();
    if (!base) return '';
    return base.replace(/\/+$/, '');
}

function normalizePath(path) {
    const raw = String(path || '').trim();
    if (!raw) return '/';
    return raw.startsWith('/') ? raw : `/${raw}`;
}

function removeApiPrefix(path) {
    if (path === '/api') return '/';
    if (path.startsWith('/api/')) return path.slice(4) || '/';
    return path;
}

function removeTrailingApiFromBase(base) {
    return base.endsWith('/api') ? base.slice(0, -4) : base;
}

function buildCandidateUrls(path) {
    const base = getApiBase();
    const normalizedPath = normalizePath(path);
    const noApiPath = removeApiPrefix(normalizedPath);
    const rootBase = removeTrailingApiFromBase(base);
    const urls = [];

    function push(url) {
        if (!url) return;
        if (!urls.includes(url)) urls.push(url);
    }

    if (base) {
        push(`${base}${normalizedPath}`);
        push(`${base}${noApiPath}`);
    }
    if (rootBase && rootBase !== base) {
        push(`${rootBase}${normalizedPath}`);
        push(`${rootBase}${noApiPath}`);
    }

    push(normalizedPath);
    push(noApiPath);
    return urls;
}

async function parseResponsePayload(res) {
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
        return res.json().catch(() => null);
    }
    const text = await res.text().catch(() => '');
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
}

export async function requestBackend(path, { method = 'GET', headers = {}, body } = {}) {
    const urls = buildCandidateUrls(path);
    let latestNotFound = null;
    let latestError = null;
    const authHeaders = {};
    if (!('Authorization' in headers) && !('authorization' in headers)) {
        const accessToken = await getAccessToken();
        if (accessToken) {
            authHeaders.Authorization = `Bearer ${accessToken}`;
        }
    }

    for (let i = 0; i < urls.length; i += 1) {
        const url = urls[i];
        try {
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders,
                    ...headers,
                },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            const data = await parseResponsePayload(res);
            if (res.ok) return data;

            if (res.status === 404) {
                latestNotFound = url;
                continue;
            }
            throw new Error(data?.message || `请求失败(${res.status})`);
        } catch (error) {
            latestError = error;
            if (i >= urls.length - 1) throw error;
        }
    }

    if (latestNotFound) {
        throw new Error(`接口不存在：${latestNotFound}，请检查 API 部署或 VITE_AUTH_API_BASE 配置`);
    }
    throw latestError || new Error('请求失败');
}
