export const PAYMENT_BACKENDS = Object.freeze({
    SUB2APIPAY: 'sub2apipay',
    CUSTOM_ORCHESTRATOR: 'custom_orchestrator',
});

export const PAYMENT_ORDER_STATUS = Object.freeze({
    PENDING: 'PENDING',
    REQUIRES_ACTION: 'REQUIRES_ACTION',
    PAID: 'PAID',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELED: 'CANCELED',
    REFUNDED: 'REFUNDED',
});

export const PAYMENT_ORDER_TERMINAL_STATUSES = new Set([
    PAYMENT_ORDER_STATUS.COMPLETED,
    PAYMENT_ORDER_STATUS.FAILED,
    PAYMENT_ORDER_STATUS.CANCELED,
    PAYMENT_ORDER_STATUS.REFUNDED,
]);

const STATUS_ALIASES = new Map([
    ['pending', PAYMENT_ORDER_STATUS.PENDING],
    ['created', PAYMENT_ORDER_STATUS.PENDING],
    ['processing', PAYMENT_ORDER_STATUS.REQUIRES_ACTION],
    ['requires_action', PAYMENT_ORDER_STATUS.REQUIRES_ACTION],
    ['action_required', PAYMENT_ORDER_STATUS.REQUIRES_ACTION],
    ['paid', PAYMENT_ORDER_STATUS.PAID],
    ['success', PAYMENT_ORDER_STATUS.PAID],
    ['succeeded', PAYMENT_ORDER_STATUS.PAID],
    ['completed', PAYMENT_ORDER_STATUS.COMPLETED],
    ['done', PAYMENT_ORDER_STATUS.COMPLETED],
    ['failed', PAYMENT_ORDER_STATUS.FAILED],
    ['error', PAYMENT_ORDER_STATUS.FAILED],
    ['expired', PAYMENT_ORDER_STATUS.FAILED],
    ['canceled', PAYMENT_ORDER_STATUS.CANCELED],
    ['cancelled', PAYMENT_ORDER_STATUS.CANCELED],
    ['closed', PAYMENT_ORDER_STATUS.CANCELED],
    ['refunded', PAYMENT_ORDER_STATUS.REFUNDED],
]);

export function normalizePaymentStatus(status) {
    const key = String(status || '')
        .trim()
        .toLowerCase();
    if (!key) return PAYMENT_ORDER_STATUS.PENDING;
    return STATUS_ALIASES.get(key) || PAYMENT_ORDER_STATUS.PENDING;
}
