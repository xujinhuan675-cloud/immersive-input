import { buildFlowGuideAuthUrl, parseFlowGuideErrorPayload } from './flowguide';

async function parseResponsePayload(response) {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
        return response.json().catch(() => null);
    }

    const text = await response.text().catch(() => '');
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
}

export async function requestFlowGuide(path, { method = 'GET', headers = {}, body, query, token } = {}) {
    const requestHeaders = {
        'Content-Type': 'application/json',
        ...headers,
    };

    const authToken = String(token || '').trim();
    if (authToken && !requestHeaders.Authorization && !requestHeaders.authorization) {
        requestHeaders.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(buildFlowGuideAuthUrl(path, { query }), {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await parseResponsePayload(response);

    if (response.ok) {
        return data;
    }

    const error = new Error(parseFlowGuideErrorPayload(data, `Request failed (${response.status})`));
    error.status = response.status;
    error.payload = data;
    throw error;
}
