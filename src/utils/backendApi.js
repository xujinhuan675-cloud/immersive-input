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

function buildCandidateUrls(path) {
    const base = getApiBase();
    const normalizedPath = normalizePath(path);
    const urls = [];

    function push(url) {
        if (!url) return;
        if (!urls.includes(url)) urls.push(url);
    }

    if (base) {
        if (base.endsWith('/api')) {
            push(`${base}${removeApiPrefix(normalizedPath)}`);
        } else {
            push(`${base}${normalizedPath}`);
        }
        return urls;
    }

    push(normalizedPath);
    push(removeApiPrefix(normalizedPath));
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

            const error = new Error(data?.message || `Request failed (${res.status})`);
            error.nonRetryable = true;
            error.url = url;
            error.status = res.status;
            throw error;
        } catch (error) {
            latestError = error;
            if (error?.nonRetryable || i >= urls.length - 1) {
                throw error;
            }
        }
    }

    if (latestNotFound) {
        throw new Error(`Endpoint not found: ${latestNotFound}`);
    }
    throw latestError || new Error('Request failed');
}
