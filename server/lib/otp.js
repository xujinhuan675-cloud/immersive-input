import crypto from 'node:crypto';

export function generateCode() {
    const n = crypto.randomInt(0, 1000000);
    return String(n).padStart(6, '0');
}

export function hashCode(code, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(String(code))
        .digest('hex');
}

export function nowIso() {
    return new Date().toISOString();
}

export function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}
