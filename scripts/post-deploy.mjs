#!/usr/bin/env node
import fetch from 'node-fetch';

function toBool(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    const normalized = String(value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function getApiUrl() {
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    return process.env.VITE_AUTH_API_BASE || 'http://localhost:3000';
}

function shouldSkipRemoteInit() {
    const isVercelBuild = !!process.env.VERCEL;
    const forceEnable = toBool(process.env.POST_DEPLOY_INIT_ENABLED, false);
    return isVercelBuild && !forceEnable;
}

async function readResponsePayload(response) {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const text = await response.text();

    if (!text) {
        return { kind: 'empty', data: null };
    }

    if (contentType.includes('application/json')) {
        try {
            return { kind: 'json', data: JSON.parse(text) };
        } catch (error) {
            return {
                kind: 'invalid-json',
                data: null,
                detail: error instanceof Error ? error.message : String(error || ''),
                preview: text.slice(0, 160),
            };
        }
    }

    return {
        kind: 'text',
        data: null,
        preview: text.slice(0, 160),
    };
}

async function initDatabase() {
    const apiUrl = getApiUrl();
    const initToken = String(process.env.INIT_DB_TOKEN || '').trim();

    if (!initToken) {
        console.log('[post-deploy] INIT_DB_TOKEN not found, skipping database init');
        return;
    }

    if (shouldSkipRemoteInit()) {
        console.log('[post-deploy] Skipping remote database init during Vercel build');
        console.log('[post-deploy] Tables will be created lazily on the first API call');
        console.log('[post-deploy] Set POST_DEPLOY_INIT_ENABLED=true only if you explicitly want this self-call');
        return;
    }

    console.log('[post-deploy] Initializing database...');
    console.log(`[post-deploy] API URL: ${apiUrl}`);

    try {
        const response = await fetch(`${apiUrl}/api/admin/init-db`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: initToken }),
        });

        const payload = await readResponsePayload(response);
        if (response.ok && payload.kind === 'json') {
            console.log('[post-deploy] Database initialized successfully');
            return;
        }

        const message =
            payload.data?.message ||
            (payload.kind === 'text'
                ? `non-JSON response received (${payload.preview || 'empty response'})`
                : payload.kind === 'invalid-json'
                  ? `invalid JSON response received (${payload.detail || 'parse failed'})`
                  : `request failed with status ${response.status}`);

        console.warn(`[post-deploy] Database init skipped: ${message}`);
        console.warn('[post-deploy] This does not block deployment; tables will be created on first API call');
    } catch (error) {
        console.warn(`[post-deploy] Database init skipped: ${error instanceof Error ? error.message : String(error || '')}`);
        console.warn('[post-deploy] This does not block deployment; tables will be created on first API call');
    }
}

initDatabase();
