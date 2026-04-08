import { PAYMENT_ORDER_STATUS } from './constants.js';

const ALLOWED_TRANSITIONS = new Map([
    [
        PAYMENT_ORDER_STATUS.PENDING,
        new Set([
            PAYMENT_ORDER_STATUS.REQUIRES_ACTION,
            PAYMENT_ORDER_STATUS.PAID,
            PAYMENT_ORDER_STATUS.FAILED,
            PAYMENT_ORDER_STATUS.CANCELED,
        ]),
    ],
    [
        PAYMENT_ORDER_STATUS.REQUIRES_ACTION,
        new Set([
            PAYMENT_ORDER_STATUS.PAID,
            PAYMENT_ORDER_STATUS.FAILED,
            PAYMENT_ORDER_STATUS.CANCELED,
        ]),
    ],
    [
        PAYMENT_ORDER_STATUS.PAID,
        new Set([PAYMENT_ORDER_STATUS.COMPLETED, PAYMENT_ORDER_STATUS.REFUNDED]),
    ],
    [PAYMENT_ORDER_STATUS.COMPLETED, new Set([PAYMENT_ORDER_STATUS.REFUNDED])],
    [PAYMENT_ORDER_STATUS.FAILED, new Set()],
    [PAYMENT_ORDER_STATUS.CANCELED, new Set()],
    [PAYMENT_ORDER_STATUS.REFUNDED, new Set()],
]);

export function canTransition(fromStatus, toStatus) {
    if (!fromStatus || !toStatus) return false;
    if (fromStatus === toStatus) return true;
    const allowed = ALLOWED_TRANSITIONS.get(fromStatus);
    if (!allowed) return false;
    return allowed.has(toStatus);
}
