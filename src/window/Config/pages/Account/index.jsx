import React, { useEffect, useRef, useState } from 'react';
import { open as openExternal } from '@tauri-apps/api/shell';
import {
    Avatar,
    Button,
    Card,
    CardBody,
    Chip,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalHeader,
} from '@nextui-org/react';
import { MdLogout } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import toast, { Toaster } from 'react-hot-toast';
import QRCode from 'qrcode';

import { getCurrentUser, logout } from '../../../../utils/auth';
import { clearStoredAdminToken, getStoredAdminToken, saveStoredAdminToken } from '../../../../utils/admin';
import { getBillingCatalog, getBillingProfile, updateAdminMembership } from '../../../../utils/billing';
import {
    cancelPaymentOrder,
    createPaymentOrder,
    getPaymentGatewayConfig,
    getPaymentOrderStatus,
    refundPaymentOrder,
} from '../../../../utils/payment';

const TIER_KEYS = {
    free: { key: 'free', color: 'default' },
    basic: { key: 'basic', color: 'primary' },
    pro: { key: 'pro', color: 'secondary' },
    enterprise: { key: 'enterprise', color: 'warning' },
};

const TERMINAL_ORDER_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELED', 'REFUNDED']);
const SUCCESS_ORDER_STATUSES = new Set(['PAID', 'COMPLETED']);

function getProviderDisplayName(provider) {
    const key = String(provider || '')
        .trim()
        .toLowerCase();
    if (key === 'alipay') return 'Alipay';
    if (key === 'wxpay') return 'WeChat Pay';
    if (key === 'easypay') return 'EasyPay';
    if (key === 'stripe') return 'Stripe';
    if (key === 'noop') return 'Noop';
    return key || '-';
}

function getProviderOptions(paymentConfig) {
    return (paymentConfig?.providers?.customOrchestrator?.adapters || []).filter(Boolean);
}

function getOrderQrPayload(order) {
    if (!order) return '';
    if (isTerminalOrderStatus(order.status)) return '';
    const presentation = order?.metadata?.checkoutPresentation || {};
    const gatewayPresentation = order?.metadata?.gatewayCreateResponse?.checkoutPresentation || {};
    const qrValue =
        presentation.qrContent ||
        gatewayPresentation.qrContent ||
        order?.metadata?.gatewayCreateResponse?.code_url ||
        '';
    if (qrValue) return String(qrValue);
    const checkoutUrl = String(order.checkoutUrl || '').trim();
    return checkoutUrl.startsWith('weixin://') ? checkoutUrl : '';
}

function isTerminalOrderStatus(status) {
    return TERMINAL_ORDER_STATUSES.has(
        String(status || '')
            .trim()
            .toUpperCase()
    );
}

function isSuccessfulOrderStatus(status) {
    return SUCCESS_ORDER_STATUSES.has(
        String(status || '')
            .trim()
            .toUpperCase()
    );
}

function formatMoney(amount, currency = 'CNY') {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) {
        return `0.00 ${currency}`;
    }
    return `${numeric.toFixed(2)} ${currency}`;
}

function formatOrderAmount(order) {
    if (!order) return '-';
    const amount = Number(order.amountCents || 0) / 100;
    return formatMoney(amount, order.currency || 'CNY');
}

function getPlanSortWeight(plan) {
    const tierWeight = {
        basic: 1,
        pro: 2,
        enterprise: 3,
    };
    const cycleWeight = {
        month: 1,
        year: 2,
    };
    return (tierWeight[plan?.tier] || 99) * 10 + (cycleWeight[plan?.billingCycle] || 99);
}

function sortSubscriptionPlans(plans) {
    return [...(plans || [])].sort((left, right) => getPlanSortWeight(left) - getPlanSortWeight(right));
}

const PLAN_DISPLAY_ORDER = Object.freeze(['free', 'basic', 'pro']);
const PLAN_CARD_STYLES = Object.freeze({
    free: {
        border: 'border-default-200',
        surface: 'from-slate-50 via-white to-slate-100',
        accent: 'from-slate-900 via-slate-700 to-slate-500',
        badge: 'bg-default-100 text-default-700',
    },
    basic: {
        border: 'border-sky-200',
        surface: 'from-sky-50 via-white to-cyan-50',
        accent: 'from-sky-600 via-cyan-500 to-teal-400',
        badge: 'bg-sky-100 text-sky-700',
    },
    pro: {
        border: 'border-violet-200',
        surface: 'from-violet-50 via-white to-fuchsia-50',
        accent: 'from-violet-600 via-fuchsia-500 to-pink-500',
        badge: 'bg-violet-100 text-violet-700',
    },
});

function getBillingCycleSortWeight(cycle) {
    if (cycle === 'month') return 1;
    if (cycle === 'year') return 2;
    return 99;
}

function getAvailableBillingCycles(plans) {
    return Array.from(
        new Set((plans || []).map((plan) => String(plan?.billingCycle || '').trim()).filter(Boolean))
    ).sort((left, right) => getBillingCycleSortWeight(left) - getBillingCycleSortWeight(right));
}

function getPlanYearlySavings(plan, allPlans) {
    if (!plan || plan.billingCycle !== 'year') return null;
    const yearAmount = Number(plan.amount);
    const monthPlan = (allPlans || []).find(
        (item) => item?.tier === plan.tier && item?.billingCycle === 'month'
    );
    const monthAmount = Number(monthPlan?.amount);
    if (!Number.isFinite(yearAmount) || !Number.isFinite(monthAmount) || monthAmount <= 0) {
        return null;
    }
    const annualMonthTotal = monthAmount * 12;
    if (annualMonthTotal <= yearAmount) return null;
    const percent = Math.round(((annualMonthTotal - yearAmount) / annualMonthTotal) * 100);
    return percent > 0 ? percent : null;
}

export default function Account() {
    const { t } = useTranslation();
    const [userInfo, setUserInfo] = useState(null);
    const [paymentConfig, setPaymentConfig] = useState(null);
    const [billingProfile, setBillingProfile] = useState(null);
    const [billingCatalog, setBillingCatalog] = useState(null);
    const [billingLoading, setBillingLoading] = useState(false);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [selectedPlanCycles, setSelectedPlanCycles] = useState({});
    const [rechargeAmount, setRechargeAmount] = useState('29');
    const [activePurchaseKey, setActivePurchaseKey] = useState('');
    const [refreshingOrder, setRefreshingOrder] = useState(false);
    const [cancelingOrder, setCancelingOrder] = useState(false);
    const [latestOrder, setLatestOrder] = useState(null);
    const [selectedPaymentProvider, setSelectedPaymentProvider] = useState('');
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [paymentIntent, setPaymentIntent] = useState(null);
    const [savedAdminToken, setSavedAdminToken] = useState('');
    const [adminTokenInput, setAdminTokenInput] = useState('');
    const [adminOrderId, setAdminOrderId] = useState('');
    const [adminRefundReason, setAdminRefundReason] = useState('');
    const [adminManagedOrder, setAdminManagedOrder] = useState(null);
    const [adminOrderLookupLoading, setAdminOrderLookupLoading] = useState(false);
    const [adminRefundLoading, setAdminRefundLoading] = useState(false);
    const [adminUserId, setAdminUserId] = useState('');
    const [adminMembershipReason, setAdminMembershipReason] = useState('');
    const [adminManagedProfile, setAdminManagedProfile] = useState(null);
    const [adminProfileLookupLoading, setAdminProfileLookupLoading] = useState(false);
    const [adminMembershipAction, setAdminMembershipAction] = useState('');
    const [quotaCountdownNow, setQuotaCountdownNow] = useState(() => Date.now());

    const pollingInFlightRef = useRef(false);
    const successNoticeRef = useRef(new Set());
    const terminalNoticeRef = useRef(new Set());
    const adminUserPrefilledRef = useRef(false);
    const subscriptionPlans = sortSubscriptionPlans(billingCatalog?.subscriptionPlans || []);

    function refreshUser() {
        const { user } = getCurrentUser();
        setUserInfo(user);
    }

    useEffect(() => {
        refreshUser();
        const timer = setInterval(refreshUser, 1500);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const storedToken = getStoredAdminToken();
        setSavedAdminToken(storedToken);
        setAdminTokenInput(storedToken);
    }, []);

    useEffect(() => {
        if (!userInfo?.id) {
            setPaymentConfig(null);
            setBillingProfile(null);
            setBillingCatalog(null);
            setLatestOrder(null);
            setSelectedPaymentProvider('');
            return;
        }
        loadPaymentConfig({ silent: true });
        loadBillingProfile(userInfo.id, { silent: true });
        loadBillingCatalog({ silent: true });
    }, [userInfo?.id]);

    useEffect(() => {
        if (userInfo?.id && !adminUserPrefilledRef.current) {
            setAdminUserId(String(userInfo.id));
            adminUserPrefilledRef.current = true;
        }
    }, [userInfo?.id]);

    useEffect(() => {
        const providerOptions = getProviderOptions(paymentConfig);
        if (providerOptions.length === 0) {
            setSelectedPaymentProvider('');
            return;
        }
        const availableValues = providerOptions.map((item) => String(item.name || '').trim());
        const nextDefault = paymentConfig?.providers?.customOrchestrator?.defaultAdapter || availableValues[0] || '';
        if (!selectedPaymentProvider || !availableValues.includes(selectedPaymentProvider)) {
            setSelectedPaymentProvider(nextDefault);
        }
    }, [paymentConfig, selectedPaymentProvider]);

    useEffect(() => {
        if (!userInfo?.id || !selectedPaymentProvider) return;
        loadBillingCatalog({ silent: true, paymentProvider: selectedPaymentProvider });
    }, [selectedPaymentProvider, userInfo?.id]);

    useEffect(() => {
        if (subscriptionPlans.length === 0) return;
        setSelectedPlanCycles((current) => {
            let changed = false;
            const next = { ...current };

            PLAN_DISPLAY_ORDER.forEach((tierKey) => {
                if (tierKey === 'free') return;
                const tierPlans = subscriptionPlans.filter((plan) => plan?.tier === tierKey);
                const tierCycles = getAvailableBillingCycles(tierPlans);
                if (tierCycles.length === 0) return;
                if (!tierCycles.includes(next[tierKey])) {
                    next[tierKey] = tierCycles[0];
                    changed = true;
                }
            });

            return changed ? next : current;
        });
    }, [billingCatalog]);

    useEffect(() => {
        const qrPayload = getOrderQrPayload(latestOrder);
        if (!qrPayload) {
            setQrCodeDataUrl('');
            return;
        }
        let cancelled = false;
        QRCode.toDataURL(qrPayload, {
            margin: 1,
            width: 320,
        })
            .then((dataUrl) => {
                if (!cancelled) {
                    setQrCodeDataUrl(dataUrl);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setQrCodeDataUrl('');
                }
            });
        return () => {
            cancelled = true;
        };
    }, [latestOrder]);

    useEffect(() => {
        if (!billingProfile?.quotaResetAt) return undefined;
        setQuotaCountdownNow(Date.now());
        const intervalId = window.setInterval(() => {
            setQuotaCountdownNow(Date.now());
        }, 1000);
        return () => {
            window.clearInterval(intervalId);
        };
    }, [billingProfile?.quotaResetAt]);

    useEffect(() => {
        const orderId = latestOrder?.id;
        const status = String(latestOrder?.status || '')
            .trim()
            .toUpperCase();
        if (!orderId || !status || isTerminalOrderStatus(status)) {
            return undefined;
        }

        const intervalId = window.setInterval(async () => {
            if (pollingInFlightRef.current) return;
            pollingInFlightRef.current = true;
            try {
                const result = await getPaymentOrderStatus(orderId);
                const nextOrder = result?.order || null;
                setLatestOrder((current) => {
                    if (!current || current.id !== orderId) return current;
                    return nextOrder || current;
                });
            } catch {
                // keep polling quietly; manual refresh remains available to the user
            } finally {
                pollingInFlightRef.current = false;
            }
        }, 3000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [latestOrder?.id, latestOrder?.status]);

    useEffect(() => {
        const orderId = latestOrder?.id;
        const status = String(latestOrder?.status || '')
            .trim()
            .toUpperCase();
        if (!orderId || !status) return;

        if (isSuccessfulOrderStatus(status)) {
            const successKey = `${orderId}:success`;
            if (successNoticeRef.current.has(successKey)) return;
            successNoticeRef.current.add(successKey);
            setQrModalOpen(false);
            loadBillingProfile(userInfo?.id, { silent: true });
            toast.success(t('config.account.payment_auto_refresh_success'));
            return;
        }

        if (!isTerminalOrderStatus(status)) return;
        setQrModalOpen(false);
        const terminalKey = `${orderId}:${status}`;
        if (terminalNoticeRef.current.has(terminalKey)) return;
        terminalNoticeRef.current.add(terminalKey);

        if (status === 'FAILED') {
            toast.error(t('config.account.payment_status_failed_notice'));
        } else if (status === 'CANCELED') {
            toast(t('config.account.payment_status_canceled_notice'));
        } else if (status === 'REFUNDED') {
            loadBillingProfile(userInfo?.id, { silent: true });
            toast(t('config.account.payment_status_refunded_notice'));
        }
    }, [latestOrder?.id, latestOrder?.status, t, userInfo?.id]);

    async function loadPaymentConfig({ silent = false } = {}) {
        try {
            const data = await getPaymentGatewayConfig();
            setPaymentConfig(data);
        } catch (error) {
            if (!silent) {
                toast.error(error.message || t('config.account.payment_load_failed'));
            }
        }
    }

    async function loadBillingProfile(userId = userInfo?.id, { silent = false } = {}) {
        if (!userId) return;
        if (!silent) setBillingLoading(true);
        try {
            const data = await getBillingProfile(userId);
            setBillingProfile(data?.profile || null);
        } catch (error) {
            if (!silent) {
                toast.error(error.message || t('config.account.billing_load_failed'));
            }
        } finally {
            if (!silent) setBillingLoading(false);
        }
    }

    async function loadBillingCatalog({
        silent = false,
        paymentProvider = selectedPaymentProvider,
    } = {}) {
        if (!userInfo?.id) return;
        if (!silent) setCatalogLoading(true);
        try {
            const data = await getBillingCatalog({ paymentProvider });
            setBillingCatalog(data?.catalog || null);
        } catch (error) {
            if (!silent) {
                toast.error(error.message || t('config.account.billing_catalog_load_failed'));
            }
        } finally {
            if (!silent) setCatalogLoading(false);
        }
    }

    function openPaymentModal(nextIntent) {
        if (!nextIntent) return;
        setPaymentIntent(nextIntent);
        setPaymentModalOpen(true);
        if (!paymentConfig) {
            loadPaymentConfig({ silent: true });
        }
    }

    async function handleLogout() {
        await logout();
        setUserInfo(null);
        setPaymentConfig(null);
        setBillingProfile(null);
        setBillingCatalog(null);
        setLatestOrder(null);
        toast.success(t('config.account.logout_success'));
    }

    async function openCheckout(url) {
        if (!url) return;
        try {
            await openExternal(url);
        } catch {
            window.open(url, '_blank');
        }
    }

    async function createOrder({
        purchaseKey,
        orderType,
        productCode,
        amount,
        currency = 'CNY',
        description,
        metadata = {},
    }) {
        if (!userInfo?.id) {
            toast.error(t('config.account.not_logged_in'));
            return null;
        }
        if (!selectedPaymentProvider) {
            toast.error(t('config.account.payment_provider_required'));
            return null;
        }

        setActivePurchaseKey(purchaseKey);
        try {
            const idempotencyKey = `${userInfo.id}_${productCode}_${Date.now()}`;
            const result = await createPaymentOrder({
                amount,
                currency,
                orderType,
                productCode,
                description,
                metadata: {
                    ...metadata,
                    userEmail: userInfo.email || '',
                },
                idempotencyKey,
                paymentProvider: selectedPaymentProvider,
            });
            setLatestOrder(result?.order || null);
            toast.success(t('config.account.payment_create_success'));
            if (getOrderQrPayload(result?.order)) {
                setQrModalOpen(true);
            } else if (result?.order?.checkoutUrl) {
                await openCheckout(result.order.checkoutUrl);
            } else {
                toast(t('config.account.payment_checkout_unavailable'));
            }
            return result;
        } catch (error) {
            toast.error(error.message || t('config.account.payment_create_failed'));
            return null;
        } finally {
            setActivePurchaseKey('');
        }
    }

    function handlePrepareRechargeOrder() {
        const amount = Number(rechargeAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            toast.error(t('config.account.payment_invalid_amount'));
            return;
        }

        openPaymentModal({
            type: 'topup',
            amount,
        });
    }

    async function handleCreateRechargeOrder(amountValue = rechargeAmount) {
        const amount = Number(amountValue);
        if (!Number.isFinite(amount) || amount <= 0) {
            toast.error(t('config.account.payment_invalid_amount'));
            return;
        }

        await createOrder({
            purchaseKey: 'topup_custom',
            orderType: 'topup',
            productCode: 'membership_topup',
            amount,
            description: `Membership recharge for ${userInfo?.email || userInfo?.id || 'user'}`,
        });
    }

    function handlePrepareSubscription(plan) {
        if (!plan) return;
        openPaymentModal({
            type: 'subscription',
            plan,
        });
    }

    async function handlePurchaseSubscription(plan) {
        if (!plan) return;
        await createOrder({
            purchaseKey: plan.productCode,
            orderType: 'subscription',
            productCode: plan.productCode,
            amount: plan.amount,
            currency: plan.currency || billingCatalog?.currency || 'CNY',
            description: `${plan.productCode} for ${userInfo?.email || userInfo?.id || 'user'}`,
            metadata: {
                planTier: plan.tier,
                billingCycle: plan.billingCycle,
                durationDays: plan.durationDays,
            },
        });
    }

    async function handleConfirmPaymentIntent() {
        if (!paymentIntent) return;
        if (paymentIntent.type === 'topup') {
            await handleCreateRechargeOrder(paymentIntent.amount);
            return;
        }
        if (paymentIntent.type === 'subscription') {
            await handlePurchaseSubscription(paymentIntent.plan);
        }
    }

    async function handleRefreshOrderStatus() {
        if (!latestOrder?.id) return;
        setRefreshingOrder(true);
        try {
            const result = await getPaymentOrderStatus(latestOrder.id);
            setLatestOrder(result?.order || latestOrder);
            await loadBillingProfile(userInfo?.id, { silent: true });
            toast.success(t('config.account.payment_refresh_success'));
        } catch (error) {
            toast.error(error.message || t('config.account.payment_refresh_failed'));
        } finally {
            setRefreshingOrder(false);
        }
    }

    async function handleCancelLatestOrder() {
        if (!latestOrder?.id || isTerminalOrderStatus(latestOrder.status)) return;
        setCancelingOrder(true);
        try {
            const result = await cancelPaymentOrder({
                orderId: latestOrder.id,
            });
            setLatestOrder(result?.order || latestOrder);
            setQrModalOpen(false);
            toast.success(t('config.account.payment_cancel_success'));
        } catch (error) {
            toast.error(error.message || t('config.account.payment_cancel_failed'));
        } finally {
            setCancelingOrder(false);
        }
    }

    function getAdminTokenOrNotify() {
        const token = String(adminTokenInput || '').trim();
        if (!token) {
            toast.error(t('config.account.admin_token_required'));
            return '';
        }
        return token;
    }

    function syncCurrentUserBilling(targetUserId) {
        if (!userInfo?.id) return;
        if (String(targetUserId || '').trim() !== String(userInfo.id).trim()) return;
        loadBillingProfile(userInfo.id, { silent: true });
    }

    async function handleSaveAdminToken() {
        const token = String(adminTokenInput || '').trim();
        if (!token) {
            toast.error(t('config.account.admin_token_required'));
            return;
        }
        const saved = saveStoredAdminToken(token);
        setSavedAdminToken(saved);
        setAdminTokenInput(saved);
        toast.success(t('config.account.admin_token_saved'));
    }

    function handleClearAdminToken() {
        clearStoredAdminToken();
        setSavedAdminToken('');
        setAdminTokenInput('');
        setAdminManagedOrder(null);
        setAdminManagedProfile(null);
        toast(t('config.account.admin_token_cleared'));
    }

    async function handleAdminOrderLookup() {
        const token = getAdminTokenOrNotify();
        if (!token) return;
        const orderId = String(adminOrderId || '').trim();
        if (!orderId) {
            toast.error(t('config.account.admin_requires_order_id'));
            return;
        }

        setAdminOrderLookupLoading(true);
        try {
            const result = await getPaymentOrderStatus(orderId, { adminToken: token });
            const order = result?.order || null;
            setAdminManagedOrder(order);
            if (order?.userId) {
                setAdminUserId(String(order.userId));
            }
            toast.success(t('config.account.admin_order_lookup_success'));
        } catch (error) {
            toast.error(error.message || t('config.account.admin_order_lookup_failed'));
        } finally {
            setAdminOrderLookupLoading(false);
        }
    }

    async function handleAdminRefund() {
        const token = getAdminTokenOrNotify();
        if (!token) return;
        const orderId = String(adminOrderId || '').trim();
        if (!orderId) {
            toast.error(t('config.account.admin_requires_order_id'));
            return;
        }

        setAdminRefundLoading(true);
        try {
            const result = await refundPaymentOrder({
                orderId,
                reason: adminRefundReason,
                adminToken: token,
            });
            const order = result?.order || null;
            setAdminManagedOrder(order);
            if (order?.userId) {
                setAdminUserId(String(order.userId));
                syncCurrentUserBilling(order.userId);
            }
            if (result?.refund?.reverseResult?.profile) {
                setAdminManagedProfile(result.refund.reverseResult.profile);
            }
            if (String(result?.refund?.status || '').toUpperCase() === 'REFUNDED') {
                toast.success(t('config.account.admin_order_refund_success'));
            } else {
                toast.success(t('config.account.admin_order_refund_pending'));
            }
        } catch (error) {
            toast.error(error.message || t('config.account.admin_order_refund_failed'));
        } finally {
            setAdminRefundLoading(false);
        }
    }

    async function handleAdminProfileLookup(nextUserId = adminUserId) {
        const token = getAdminTokenOrNotify();
        if (!token) return;
        const targetUserId = String(nextUserId || '').trim();
        if (!targetUserId) {
            toast.error(t('config.account.admin_requires_user_id'));
            return;
        }

        setAdminProfileLookupLoading(true);
        try {
            const result = await getBillingProfile(targetUserId, { adminToken: token });
            setAdminManagedProfile(result?.profile || null);
            toast.success(t('config.account.admin_membership_lookup_success'));
        } catch (error) {
            toast.error(error.message || t('config.account.admin_membership_lookup_failed'));
        } finally {
            setAdminProfileLookupLoading(false);
        }
    }

    async function handleAdminMembershipAction(action) {
        const token = getAdminTokenOrNotify();
        if (!token) return;
        const targetUserId = String(adminUserId || '').trim();
        if (!targetUserId) {
            toast.error(t('config.account.admin_requires_user_id'));
            return;
        }

        setAdminMembershipAction(action);
        try {
            const result = await updateAdminMembership({
                userId: targetUserId,
                action,
                reason: adminMembershipReason,
                adminToken: token,
            });
            setAdminManagedProfile(result?.profile || null);
            syncCurrentUserBilling(targetUserId);
            toast.success(
                action === 'suspend'
                    ? t('config.account.admin_membership_suspend_success')
                    : t('config.account.admin_membership_resume_success')
            );
        } catch (error) {
            toast.error(error.message || t('config.account.admin_membership_action_failed'));
        } finally {
            setAdminMembershipAction('');
        }
    }

    function getStatusColor(status) {
        const normalized = String(status || '').toUpperCase();
        if (normalized === 'PAID' || normalized === 'COMPLETED') return 'success';
        if (normalized === 'FAILED' || normalized === 'CANCELED') return 'danger';
        if (normalized === 'REFUNDED') return 'warning';
        return 'primary';
    }

    function formatBillingValue(value) {
        if (value === null || value === undefined || value === '') {
            return t('config.account.billing_none');
        }
        return String(value);
    }

    function formatBillingDateTime(value) {
        if (!value) return t('config.account.billing_none');
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString();
    }

    function formatBillingQuota(value) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric < 0) return t('config.account.billing_unlimited');
        if (!Number.isFinite(numeric)) return '0';
        return String(numeric);
    }

    function resolveQuotaResetDeadline(value) {
        const raw = String(value || '').trim();
        if (!raw) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            const baseTime = Date.parse(`${raw}T00:00:00.000Z`);
            if (Number.isNaN(baseTime)) return null;
            return new Date(baseTime + 24 * 60 * 60 * 1000);
        }
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        const next = new Date(parsed);
        next.setUTCDate(next.getUTCDate() + 1);
        next.setUTCHours(0, 0, 0, 0);
        return next;
    }

    function formatQuotaResetCountdown(deadline, nowValue = Date.now()) {
        if (!(deadline instanceof Date) || Number.isNaN(deadline.getTime())) {
            return t('config.account.billing_none');
        }
        const remainingMs = deadline.getTime() - Number(nowValue || 0);
        if (remainingMs <= 0) {
            return t('config.account.billing_quota_reset_due');
        }
        const totalSeconds = Math.floor(remainingMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return [hours, minutes, seconds]
            .map((value) => String(value).padStart(2, '0'))
            .join(':');
    }

    function formatPlanQuota(plan) {
        const quota = Number(plan?.dailyQuota);
        if (Number.isFinite(quota) && quota < 0) {
            return t('config.account.subscription_unlimited_quota_value');
        }
        return t('config.account.subscription_daily_quota_value', {
            value: Number.isFinite(quota) ? quota : 0,
        });
    }

    function getBillingStatusColor(status) {
        const normalized = String(status || '').toLowerCase();
        if (normalized === 'active') return 'success';
        if (
            normalized === 'inactive' ||
            normalized === 'suspended' ||
            normalized === 'canceled' ||
            normalized === 'cancelled'
        ) {
            return 'danger';
        }
        return 'warning';
    }

    function getBillingStatusLabel(status) {
        const normalized = String(status || '').toLowerCase();
        if (normalized === 'active') return t('config.account.billing_status_active');
        if (normalized === 'inactive') return t('config.account.billing_status_inactive');
        if (normalized === 'suspended') return t('config.account.billing_status_suspended');
        if (normalized === 'canceled' || normalized === 'cancelled') {
            return t('config.account.billing_status_canceled');
        }
        return formatBillingValue(status).toUpperCase();
    }

    function getAdminReverseReasonLabel(reason) {
        const normalized = String(reason || '')
            .trim()
            .toUpperCase();
        if (!normalized) return t('config.account.billing_none');
        if (normalized === 'DUPLICATE_REFUND_REVERSAL') {
            return t('config.account.admin_order_refund_duplicate');
        }
        if (normalized === 'MISSING_PREVIOUS_PROFILE_SNAPSHOT') {
            return t('config.account.admin_order_refund_missing_snapshot');
        }
        if (normalized === 'LATER_SUBSCRIPTION_EXISTS') {
            return t('config.account.admin_order_refund_later_subscription');
        }
        return normalized;
    }

    function getOrderTypeLabel(orderType) {
        const normalized = String(orderType || '')
            .trim()
            .toLowerCase();
        if (normalized === 'subscription') return t('config.account.order_type_subscription');
        if (normalized === 'topup') return t('config.account.order_type_topup');
        return normalized || '-';
    }

    const displayTier = billingProfile?.tier || userInfo?.membership_tier || 'free';
    const tierConfig = userInfo ? TIER_KEYS[displayTier] ?? TIER_KEYS.free : null;
    const activeBackend = paymentConfig?.activeBackend || '-';
    const customEnabled = paymentConfig?.customOrchestratorEnabled ? 'ON' : 'OFF';
    const paymentProviderOptions = getProviderOptions(paymentConfig);
    const selectedProviderDetail = paymentProviderOptions.find((item) => item.name === selectedPaymentProvider) || null;
    const paymentChannel =
        selectedPaymentProvider ||
        paymentConfig?.providers?.customOrchestrator?.channel ||
        paymentConfig?.providers?.customOrchestrator?.adapter ||
        '-';
    const paymentReady =
        selectedProviderDetail?.ready ?? paymentConfig?.providers?.customOrchestrator?.ready;
    const paymentMissingFields =
        selectedProviderDetail?.missingFields ||
        paymentConfig?.providers?.customOrchestrator?.missingFields ||
        [];
    const hasReadyPaymentProvider =
        paymentProviderOptions.length > 0
            ? paymentProviderOptions.some((item) => item.ready !== false)
            : paymentReady !== false;
    const topupCreditsPerUnit = Number(
        billingCatalog?.topupCreditsPerUnit ?? billingCatalog?.topupCreditsPerCny
    );
    const latestOrderQrPayload = getOrderQrPayload(latestOrder);
    const topupPresets = billingCatalog?.topupPresets || [];
    const estimatedRechargeCredits =
        Number.isFinite(topupCreditsPerUnit) && Number.isFinite(Number(rechargeAmount))
            ? Math.max(0, Math.floor(Number(rechargeAmount) * topupCreditsPerUnit))
            : null;
    const activeAdminToken = String(adminTokenInput || '').trim();
    const hasSavedAdminToken = Boolean(savedAdminToken);
    const adminTokenDirty = activeAdminToken !== savedAdminToken;
    const adminRefundMeta = adminManagedOrder?.metadata?.refund || null;
    const currentBillingTierKey = tierConfig?.key || 'free';
    const paymentIntentType = paymentIntent?.type || '';
    const paymentIntentPlan = paymentIntentType === 'subscription' ? paymentIntent?.plan || null : null;
    const paymentIntentTopupAmount =
        paymentIntentType === 'topup' ? Number(paymentIntent?.amount) || 0 : 0;
    const paymentIntentEstimatedCredits =
        Number.isFinite(topupCreditsPerUnit) && Number.isFinite(paymentIntentTopupAmount)
            ? Math.max(0, Math.floor(paymentIntentTopupAmount * topupCreditsPerUnit))
            : null;
    const paymentIntentOrderType =
        paymentIntentType === 'subscription'
            ? 'subscription'
            : paymentIntentType === 'topup'
              ? 'topup'
              : '';
    const paymentIntentProductCode =
        paymentIntentType === 'subscription'
            ? String(paymentIntentPlan?.productCode || '').trim()
            : paymentIntentType === 'topup'
              ? 'membership_topup'
              : '';
    const paymentIntentTitle =
        paymentIntentType === 'subscription' && paymentIntentPlan
            ? `${t(`config.account.tier_${paymentIntentPlan.tier}`)} ${t(
                  `config.account.subscription_cycle_${paymentIntentPlan.billingCycle}`
              )}`
            : t('config.account.order_type_topup');
    const paymentIntentAmountLabel =
        paymentIntentType === 'subscription' && paymentIntentPlan
            ? formatMoney(paymentIntentPlan.amount, paymentIntentPlan.currency)
            : formatMoney(paymentIntentTopupAmount, billingCatalog?.currency || 'CNY');
    const paymentFlowOrder =
        latestOrder &&
        paymentIntentProductCode &&
        String(latestOrder.productCode || '').trim() === paymentIntentProductCode &&
        String(latestOrder.orderType || '')
            .trim()
            .toLowerCase() === paymentIntentOrderType
            ? latestOrder
            : null;
    const paymentFlowQrPayload = paymentFlowOrder ? latestOrderQrPayload : '';
    const billingQuotaValue = Number(billingProfile?.dailyQuota);
    const billingUsedValue = Math.max(0, Number(billingProfile?.dailyQuotaUsed) || 0);
    const billingUsageQuotaLabel =
        Number.isFinite(billingQuotaValue) && billingQuotaValue < 0
            ? t('config.account.billing_unlimited')
            : formatBillingQuota(billingProfile?.dailyQuota);
    const billingUsageDisplay = `${billingUsedValue}/${billingUsageQuotaLabel}`;
    const billingCreditsDisplay = formatBillingValue(billingProfile?.bonusCredits);
    const billingExpiryDisplay = formatBillingDateTime(billingProfile?.subscriptionExpiresAt);
    const quotaResetDeadline = resolveQuotaResetDeadline(billingProfile?.quotaResetAt);
    const quotaResetCountdownDisplay = formatQuotaResetCountdown(quotaResetDeadline, quotaCountdownNow);
    const quotaResetExactDisplay = quotaResetDeadline
        ? formatBillingDateTime(quotaResetDeadline)
        : t('config.account.billing_none');
    const billingStatusLabel = billingProfile?.status
        ? getBillingStatusLabel(billingProfile.status)
        : null;
    const billingStatusColor = billingProfile?.status
        ? getBillingStatusColor(billingProfile.status)
        : 'default';
    const comparisonFreePlan = {
        productCode: 'membership_free',
        tier: 'free',
        billingCycle: 'month',
        durationDays: 30,
        amount: 0,
        currency: billingCatalog?.currency || 'CNY',
        dailyQuota: billingCatalog?.freeTier?.dailyQuota ?? 20,
        allowCreditFallback: billingCatalog?.freeTier?.allowCreditFallback ?? true,
        isIncludedPlan: true,
    };
    const subscriptionPlanCards =
        subscriptionPlans.length > 0
            ? PLAN_DISPLAY_ORDER.map((tierKey) => {
                  if (tierKey === 'free') {
                      return {
                          tierKey,
                          plan: comparisonFreePlan,
                          availableCycles: [],
                      };
                  }

                  const tierPlans = subscriptionPlans.filter((plan) => plan?.tier === tierKey);
                  if (tierPlans.length === 0) return null;
                  const tierCycles = getAvailableBillingCycles(tierPlans);
                  const selectedCycle = tierCycles.includes(selectedPlanCycles[tierKey])
                      ? selectedPlanCycles[tierKey]
                      : tierCycles[0];
                  const selectedPlan =
                      tierPlans.find((plan) => plan?.billingCycle === selectedCycle) || tierPlans[0];

                  return {
                      tierKey,
                      plan: selectedPlan,
                      availableCycles: tierCycles,
                  };
              }).filter(Boolean)
            : [];

    return (
        <div className='space-y-4 p-1'>
            <Toaster
                position='top-center'
                toastOptions={{ duration: 2500, style: { fontSize: '13px', borderRadius: '10px' } }}
            />

            {userInfo && (
                <Card
                    shadow='none'
                    className='border-1 border-default-100'
                >
                    <CardBody className='space-y-4 p-4 md:p-5'>
                        <div className='flex flex-col gap-4 rounded-[28px] border border-default-100 bg-gradient-to-br from-white via-default-50 to-white p-5 shadow-sm shadow-default-100/70'>
                            <div className='flex items-start gap-4'>
                                <Avatar
                                    name={userInfo.display_name?.charAt(0)?.toUpperCase() ?? 'U'}
                                    size='lg'
                                    classNames={{
                                        base: 'bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6]',
                                        name: 'text-white font-bold text-lg',
                                    }}
                                />
                                <div className='min-w-0 flex-1'>
                                    <div className='flex flex-wrap items-center gap-2'>
                                        <p className='truncate font-semibold text-default-800'>
                                            {userInfo.display_name}
                                        </p>
                                        <Chip
                                            size='sm'
                                            color={tierConfig.color}
                                            variant='flat'
                                            className='text-xs'
                                        >
                                            {t(`config.account.tier_${tierConfig.key}`)}
                                        </Chip>
                                        {billingStatusLabel ? (
                                            <Chip
                                                size='sm'
                                                color={billingStatusColor}
                                                variant='flat'
                                                className='text-xs'
                                            >
                                                {billingStatusLabel}
                                            </Chip>
                                        ) : null}
                                    </div>
                                    <p className='mt-1 truncate text-xs text-default-400'>
                                        {userInfo.email}
                                    </p>
                                </div>
                                <Button
                                    isIconOnly
                                    size='sm'
                                    variant='light'
                                    color='danger'
                                    className='shrink-0'
                                    title={t('config.account.logout')}
                                    onPress={handleLogout}
                                >
                                    <MdLogout className='text-lg' />
                                </Button>
                            </div>

                            <div className='grid gap-3 xl:grid-cols-[minmax(320px,0.95fr)_minmax(380px,1.05fr)]'>
                                <div className='rounded-[22px] border border-sky-100 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.18),transparent_36%),linear-gradient(135deg,#f8fbff_0%,#eef4ff_100%)] p-4 shadow-sm shadow-sky-100/50'>
                                    <div className='flex items-center justify-between gap-2'>
                                        <p className='text-sm font-semibold text-default-900'>
                                            {t('config.account.billing_title')}
                                        </p>
                                        <Button
                                            size='sm'
                                            variant='light'
                                            isLoading={billingLoading}
                                            onPress={() => loadBillingProfile(userInfo.id)}
                                        >
                                            {t('config.account.billing_reload')}
                                        </Button>
                                    </div>

                                    {billingProfile ? (
                                        <div className='mt-3 rounded-[18px] border border-white/80 bg-white/88 px-4 py-4 shadow-sm shadow-sky-100/40'>
                                            <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_220px] lg:items-center'>
                                                <div className='flex flex-wrap items-end gap-3'>
                                                    <span className='text-4xl font-semibold tracking-tight text-slate-900 sm:text-[42px]'>
                                                        {billingUsageDisplay}
                                                    </span>
                                                    {Number.isFinite(billingQuotaValue) &&
                                                        billingQuotaValue < 0 && (
                                                            <div className='mb-1 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700'>
                                                                {t('config.account.billing_unlimited')}
                                                            </div>
                                                        )}
                                                </div>

                                                <div className='space-y-1 lg:border-l lg:border-default-200 lg:pl-4'>
                                                    <p className='text-[11px] uppercase tracking-[0.18em] text-sky-700/80'>
                                                        {t('config.account.billing_subscription_expires')}
                                                    </p>
                                                    <p className='text-sm font-medium leading-6 text-slate-700'>
                                                        {billingExpiryDisplay}
                                                    </p>
                                                </div>

                                                <div className='space-y-1 lg:border-l lg:border-default-200 lg:pl-4'>
                                                    <p className='text-[11px] uppercase tracking-[0.18em] text-sky-700/80'>
                                                        {t('config.account.billing_quota_reset_countdown')}
                                                    </p>
                                                    <p className='text-base font-semibold tracking-tight text-slate-900'>
                                                        {quotaResetCountdownDisplay}
                                                    </p>
                                                    <p className='text-xs text-slate-500'>
                                                        {t('config.account.billing_quota_reset_at')}:
                                                        <span className='ml-1 text-slate-600'>
                                                            {quotaResetExactDisplay}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className='text-xs text-default-500'>
                                            {t('config.account.billing_not_ready')}
                                        </p>
                                    )}
                                </div>

                                <div className='rounded-[22px] border border-default-200 bg-gradient-to-br from-default-50 via-white to-default-100 p-4 shadow-sm shadow-default-100/50'>
                                    <div className='flex items-start justify-between gap-3'>
                                        <div className='space-y-1'>
                                            <p className='text-sm font-semibold text-default-900'>
                                                {t('config.account.credit_topup_title')}
                                            </p>
                                            <p className='text-xs text-default-500'>
                                                {t('config.account.credit_topup_subtitle')}
                                            </p>
                                        </div>

                                        <div className='inline-flex min-w-[132px] items-center gap-3 rounded-full border border-default-200 bg-white/90 px-3 py-2 shadow-sm shadow-default-100/60'>
                                            <p className='text-[11px] uppercase tracking-[0.18em] text-default-500'>
                                                {t('config.account.billing_credits')}
                                            </p>
                                            <p className='text-2xl font-semibold tracking-tight text-default-900'>
                                                {billingCreditsDisplay}
                                            </p>
                                        </div>
                                    </div>

                                    <div className='mt-4 space-y-2'>
                                        <p className='text-xs font-medium text-default-600'>
                                            {t('config.account.topup_presets_title')}
                                        </p>
                                        {topupPresets.length > 0 && (
                                            <div className='flex flex-wrap gap-2'>
                                                {topupPresets.map((preset) => (
                                                    <Button
                                                        key={`${preset.productCode}_${preset.amount}`}
                                                        size='sm'
                                                        variant={
                                                            Number(rechargeAmount) ===
                                                            Number(preset.amount)
                                                                ? 'solid'
                                                                : 'bordered'
                                                        }
                                                        color='primary'
                                                        onPress={() =>
                                                            setRechargeAmount(String(preset.amount))
                                                        }
                                                    >
                                                        {formatMoney(preset.amount, preset.currency)}
                                                    </Button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className='mt-4 flex flex-wrap items-end gap-2'>
                                        <Input
                                            type='number'
                                            min={0.01}
                                            step={0.01}
                                            size='sm'
                                            label={t('config.account.credit_purchase_amount')}
                                            value={rechargeAmount}
                                            onValueChange={setRechargeAmount}
                                            className='max-w-[190px]'
                                        />
                                        <Button
                                            size='sm'
                                            color='primary'
                                            isDisabled={!hasReadyPaymentProvider}
                                            onPress={handlePrepareRechargeOrder}
                                        >
                                            {t('config.account.credit_purchase_action')}
                                        </Button>

                                        {estimatedRechargeCredits !== null && (
                                            <p className='text-xs text-default-500 sm:ml-auto sm:self-center'>
                                                {t('config.account.topup_credit_estimate')}:
                                                <span className='ml-1 font-mono text-default-700'>
                                                    {estimatedRechargeCredits}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardBody>
                </Card>
            )}

            {userInfo && (
                <Card
                    shadow='none'
                    className='border-1 border-default-100'
                >
                    <CardBody className='space-y-3'>
                        <div className='flex items-center justify-between gap-2'>
                            <p className='text-sm font-semibold text-default-800'>
                                {t('config.account.subscription_title')}
                            </p>
                            <Button
                                size='sm'
                                variant='light'
                                isLoading={catalogLoading}
                                onPress={() => loadBillingCatalog({ silent: false })}
                            >
                                {t('config.account.billing_reload')}
                            </Button>
                        </div>

                        <p className='text-xs text-default-500'>
                            {t('config.account.subscription_subtitle')}
                        </p>

                        {subscriptionPlanCards.length > 0 ? (
                            <div className='grid gap-4 xl:grid-cols-3'>
                                {subscriptionPlanCards.map(({ plan, availableCycles }) => {
                                    const planTierConfig = TIER_KEYS[plan.tier] ?? TIER_KEYS.free;
                                    const planCardStyle =
                                        PLAN_CARD_STYLES[plan.tier] || PLAN_CARD_STYLES.basic;
                                    const isFreePlan = plan.tier === 'free' || plan.isIncludedPlan;
                                    const isCurrentPlan = currentBillingTierKey === plan.tier;
                                    const isRecommendedPlan = plan.tier === 'pro';
                                    const yearlySavings = getPlanYearlySavings(plan, subscriptionPlans);
                                    const monthlyAverage =
                                        !isFreePlan && plan.billingCycle === 'year'
                                            ? formatMoney(Number(plan.amount || 0) / 12, plan.currency)
                                            : null;

                                    return (
                                        <div
                                            key={`${plan.tier}_${plan.billingCycle}`}
                                            className={`relative overflow-hidden rounded-[28px] border bg-gradient-to-b ${planCardStyle.surface} p-5 shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg ${planCardStyle.border}`}
                                        >
                                            <div
                                                className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${planCardStyle.accent}`}
                                            />

                                            <div className='relative flex h-full flex-col'>
                                                <div className='flex items-start justify-between gap-3'>
                                                    <div className='space-y-3'>
                                                        <div className='flex flex-wrap items-center gap-2'>
                                                            <span
                                                                className={`rounded-full px-3 py-1 text-[11px] font-medium ${planCardStyle.badge}`}
                                                            >
                                                                {t(`config.account.tier_${planTierConfig.key}`)}
                                                            </span>
                                                            {isRecommendedPlan && (
                                                                <Chip
                                                                    size='sm'
                                                                    color='secondary'
                                                                    variant='flat'
                                                                    className='text-[10px]'
                                                                >
                                                                    {t(
                                                                        'config.account.subscription_recommended'
                                                                    )}
                                                                </Chip>
                                                            )}
                                                            {isCurrentPlan && (
                                                                <Chip
                                                                    size='sm'
                                                                    color='success'
                                                                    variant='flat'
                                                                    className='text-[10px]'
                                                                >
                                                                    {t(
                                                                        'config.account.subscription_current_plan'
                                                                    )}
                                                                </Chip>
                                                            )}
                                                        </div>

                                                        <div>
                                                            <p className='text-3xl font-semibold tracking-tight text-default-900'>
                                                                {isFreePlan
                                                                    ? t(
                                                                          'config.account.subscription_price_free'
                                                                      )
                                                                    : formatMoney(
                                                                          plan.amount,
                                                                          plan.currency
                                                                      )}
                                                                {!isFreePlan && (
                                                                    <span className='ml-1 text-sm font-normal text-default-400'>
                                                                        /
                                                                        {t(
                                                                            `config.account.subscription_unit_${plan.billingCycle}`
                                                                        )}
                                                                    </span>
                                                                )}
                                                            </p>
                                                            {monthlyAverage && (
                                                                <p className='mt-2 text-xs text-default-500'>
                                                                    {t(
                                                                        'config.account.subscription_monthly_average',
                                                                        {
                                                                            value: monthlyAverage,
                                                                        }
                                                                    )}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {!isFreePlan ? (
                                                        <div className='flex flex-col items-end gap-2'>
                                                            <div className='inline-flex rounded-full bg-white/80 p-1 shadow-sm ring-1 ring-black/5'>
                                                                {availableCycles.map((cycle) => {
                                                                    const active = plan.billingCycle === cycle;
                                                                    return (
                                                                        <button
                                                                            key={`${plan.tier}_${cycle}`}
                                                                            type='button'
                                                                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                                                                active
                                                                                    ? 'bg-default-900 text-white shadow-sm'
                                                                                    : 'text-default-500 hover:text-default-800'
                                                                            }`}
                                                                            onClick={() =>
                                                                                setSelectedPlanCycles(
                                                                                    (current) => ({
                                                                                        ...current,
                                                                                        [plan.tier]:
                                                                                            cycle,
                                                                                    })
                                                                                )
                                                                            }
                                                                        >
                                                                            {t(
                                                                                `config.account.subscription_cycle_${cycle}`
                                                                            )}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                            {yearlySavings ? (
                                                                <div className='rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600'>
                                                                    {t(
                                                                        'config.account.subscription_yearly_savings',
                                                                        {
                                                                            value: yearlySavings,
                                                                        }
                                                                    )}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <p className='mt-4 text-sm leading-6 text-default-500'>
                                                    {t(
                                                        `config.account.subscription_tier_${plan.tier}_desc`
                                                    )}
                                                </p>

                                                <div className='mt-5 rounded-[22px] bg-white/90 p-4 shadow-sm ring-1 ring-black/5'>
                                                    <p className='text-xs text-default-500'>
                                                        {t('config.account.billing_daily_quota')}
                                                    </p>
                                                    <p className='mt-2 text-2xl font-semibold tracking-tight text-default-900'>
                                                        {formatBillingQuota(plan.dailyQuota)}
                                                    </p>
                                                    <p className='mt-2 text-xs text-default-500'>
                                                        {formatPlanQuota(plan)}
                                                    </p>
                                                </div>

                                                <div className='mt-5 space-y-2 text-xs text-default-500'>
                                                    <div className='flex items-start gap-2'>
                                                        <span
                                                            className={`mt-[6px] h-1.5 w-1.5 rounded-full bg-gradient-to-r ${planCardStyle.accent}`}
                                                        />
                                                        <span>
                                                            {isFreePlan
                                                                ? t(
                                                                      'config.account.subscription_free_feature'
                                                                  )
                                                                : t(
                                                                      'config.account.subscription_duration_value',
                                                                      {
                                                                          value: plan.durationDays,
                                                                      }
                                                                  )}
                                                        </span>
                                                    </div>
                                                    {plan.allowCreditFallback && (
                                                        <div className='flex items-start gap-2'>
                                                            <span
                                                                className={`mt-[6px] h-1.5 w-1.5 rounded-full bg-gradient-to-r ${planCardStyle.accent}`}
                                                            />
                                                            <span>
                                                                {t(
                                                                    'config.account.subscription_credit_fallback'
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className='mt-6'>
                                                    {isFreePlan ? (
                                                        <Button
                                                            fullWidth
                                                            size='md'
                                                            variant='flat'
                                                            isDisabled
                                                        >
                                                            {isCurrentPlan
                                                                ? t(
                                                                      'config.account.subscription_current_plan'
                                                                  )
                                                                : t(
                                                                      'config.account.subscription_free_action'
                                                                  )}
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            fullWidth
                                                            size='md'
                                                            color={
                                                                plan.tier === 'pro'
                                                                    ? 'secondary'
                                                                    : 'primary'
                                                            }
                                                            isDisabled={!hasReadyPaymentProvider}
                                                            onPress={() => handlePrepareSubscription(plan)}
                                                        >
                                                            {t('config.account.subscription_buy')}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className='text-xs text-default-500'>{t('config.account.subscription_not_ready')}</p>
                        )}

                    </CardBody>
                </Card>
            )}

            <Modal
                isOpen={paymentModalOpen}
                onOpenChange={setPaymentModalOpen}
                placement='center'
                size='3xl'
                scrollBehavior='inside'
            >
                <ModalContent>
                    <ModalHeader className='flex flex-col gap-1'>
                        <span>{t('config.account.payment_title')}</span>
                        <span className='text-xs font-normal text-default-400'>{paymentIntentTitle}</span>
                    </ModalHeader>
                    <ModalBody className='space-y-4 pb-6'>
                        <div className='rounded-[24px] border border-default-200 bg-gradient-to-br from-default-50 via-white to-default-50 p-4'>
                            <div className='flex items-start justify-between gap-3'>
                                <div className='space-y-1'>
                                    <p className='text-xs text-default-500'>
                                        {t('config.account.payment_order_type')}
                                    </p>
                                    <p className='text-sm font-semibold text-default-800'>
                                        {paymentIntentType === 'subscription'
                                            ? t('config.account.order_type_subscription')
                                            : t('config.account.order_type_topup')}
                                    </p>
                                    <p className='text-xs text-default-500'>{paymentIntentTitle}</p>
                                    {paymentIntentProductCode && (
                                        <p className='text-xs text-default-500'>
                                            {t('config.account.payment_order_product')}:
                                            <span className='ml-1 font-mono text-default-700'>
                                                {paymentIntentProductCode}
                                            </span>
                                        </p>
                                    )}
                                </div>
                                <div className='text-right'>
                                    <p className='text-lg font-semibold text-default-900'>
                                        {paymentIntentAmountLabel}
                                    </p>
                                    {paymentIntentType === 'topup' &&
                                        paymentIntentEstimatedCredits !== null && (
                                            <p className='mt-1 text-xs text-default-500'>
                                                {t('config.account.topup_credit_estimate')}:
                                                <span className='ml-1 font-mono text-default-700'>
                                                    {paymentIntentEstimatedCredits}
                                                </span>
                                            </p>
                                        )}
                                </div>
                            </div>
                        </div>

                        <div className='rounded-[24px] border border-default-200 p-4'>
                            <div className='mb-3 flex items-center justify-between gap-2'>
                                <p className='text-sm font-semibold text-default-800'>
                                    {t('config.account.payment_title')}
                                </p>
                                <Button
                                    size='sm'
                                    variant='light'
                                    onPress={() => loadPaymentConfig({ silent: false })}
                                >
                                    {t('config.account.payment_reload')}
                                </Button>
                            </div>
                            <div className='space-y-1 text-xs text-default-500'>
                                <p>
                                    {t('config.account.payment_active_backend')}:
                                    <span className='ml-1 font-mono text-default-700'>{activeBackend}</span>
                                </p>
                                <p>
                                    {t('config.account.payment_custom_enabled')}:
                                    <span className='ml-1 font-mono text-default-700'>{customEnabled}</span>
                                </p>
                                <p>
                                    {t('config.account.payment_channel')}:
                                    <span className='ml-1 font-mono text-default-700'>{paymentChannel}</span>
                                </p>
                                <p>
                                    {t('config.account.payment_channel_ready')}:
                                    <span className='ml-1 font-mono text-default-700'>
                                        {paymentReady === undefined
                                            ? '-'
                                            : paymentReady
                                              ? t('config.account.payment_ready_yes')
                                              : t('config.account.payment_ready_no')}
                                    </span>
                                </p>
                                {paymentMissingFields.length > 0 && (
                                    <p>
                                        {t('config.account.payment_missing_fields')}:
                                        <span className='ml-1 font-mono text-danger-500'>
                                            {paymentMissingFields.join(', ')}
                                        </span>
                                    </p>
                                )}
                            </div>
                        </div>

                        {paymentProviderOptions.length > 0 && (
                            <div className='space-y-2'>
                                <label className='text-xs text-default-500'>
                                    {t('config.account.payment_provider_label')}
                                </label>
                                <select
                                    value={selectedPaymentProvider}
                                    onChange={(event) => setSelectedPaymentProvider(event.target.value)}
                                    className='w-full rounded-lg border border-default-200 bg-transparent px-3 py-2 text-sm text-default-700 outline-none'
                                >
                                    {paymentProviderOptions.map((item) => (
                                        <option
                                            key={item.name}
                                            value={item.name}
                                        >
                                            {getProviderDisplayName(item.name)}
                                            {item.ready === false ? ` (${t('config.account.payment_ready_no')})` : ''}
                                        </option>
                                    ))}
                                </select>
                                {selectedProviderDetail?.missingFields?.length > 0 && (
                                    <p className='text-xs text-danger-500'>
                                        {t('config.account.payment_provider_missing')}:{' '}
                                        <span className='font-mono'>
                                            {selectedProviderDetail.missingFields.join(', ')}
                                        </span>
                                    </p>
                                )}
                            </div>
                        )}

                        <Button
                            size='md'
                            color={
                                paymentIntentType === 'subscription' && paymentIntentPlan?.tier === 'pro'
                                    ? 'secondary'
                                    : 'primary'
                            }
                            isLoading={
                                paymentIntentType === 'subscription'
                                    ? activePurchaseKey === paymentIntentPlan?.productCode
                                    : activePurchaseKey === 'topup_custom'
                            }
                            isDisabled={!paymentIntent || selectedProviderDetail?.ready === false}
                            onPress={handleConfirmPaymentIntent}
                        >
                            {paymentIntentType === 'subscription'
                                ? t('config.account.subscription_buy')
                                : t('config.account.payment_create')}
                        </Button>

                        {paymentFlowOrder && (
                            <div className='space-y-2 rounded-lg border border-default-200 p-3'>
                                <div className='flex items-center justify-between gap-2'>
                                    <p className='text-xs text-default-600'>
                                        {t('config.account.payment_latest_order')}:
                                        <span className='ml-1 font-mono'>{paymentFlowOrder.id}</span>
                                    </p>
                                    <Chip
                                        size='sm'
                                        color={getStatusColor(paymentFlowOrder.status)}
                                        variant='flat'
                                        className='text-[10px]'
                                    >
                                        {paymentFlowOrder.status}
                                    </Chip>
                                </div>
                                <p className='text-xs text-default-500'>
                                    {t('config.account.payment_order_amount')}:
                                    <span className='ml-1 text-default-700'>
                                        {formatOrderAmount(paymentFlowOrder)}
                                    </span>
                                </p>
                                <p className='text-xs text-default-500'>
                                    {t('config.account.payment_provider_label')}:
                                    <span className='ml-1 text-default-700'>
                                        {getProviderDisplayName(paymentFlowOrder.provider)}
                                    </span>
                                </p>
                                <p className='text-xs text-default-500'>
                                    {t('config.account.payment_order_type')}:
                                    <span className='ml-1 text-default-700'>
                                        {getOrderTypeLabel(paymentFlowOrder.orderType)}
                                    </span>
                                </p>
                                {paymentFlowOrder.productCode && (
                                    <p className='text-xs text-default-500'>
                                        {t('config.account.payment_order_product')}:
                                        <span className='ml-1 text-default-700'>
                                            {paymentFlowOrder.productCode}
                                        </span>
                                    </p>
                                )}
                                {!isTerminalOrderStatus(paymentFlowOrder.status) && (
                                    <p className='text-xs text-primary-500'>
                                        {t('config.account.payment_polling')}
                                    </p>
                                )}
                                {paymentFlowQrPayload && (
                                    <div className='rounded-xl border border-default-200 bg-default-50/70 p-3'>
                                        <p className='mb-2 text-xs font-medium text-default-600'>
                                            {t('config.account.payment_qr_inline_title')}
                                        </p>
                                        {qrCodeDataUrl ? (
                                            <img
                                                src={qrCodeDataUrl}
                                                alt='payment qr code'
                                                className='mx-auto h-52 w-52 rounded-xl border border-default-200 bg-white p-3'
                                            />
                                        ) : (
                                            <div className='mx-auto flex h-52 w-52 items-center justify-center rounded-xl border border-default-200 bg-white text-sm text-default-400'>
                                                {t('config.account.payment_qr_loading')}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className='flex flex-wrap gap-2'>
                                    {!paymentFlowQrPayload && (
                                        <Button
                                            size='sm'
                                            variant='bordered'
                                            isDisabled={!paymentFlowOrder.checkoutUrl}
                                            onPress={() => openCheckout(paymentFlowOrder.checkoutUrl)}
                                        >
                                            {t('config.account.payment_open_checkout')}
                                        </Button>
                                    )}
                                    {paymentFlowQrPayload && (
                                        <Button
                                            size='sm'
                                            variant='bordered'
                                            onPress={() => setQrModalOpen(true)}
                                        >
                                            {t('config.account.payment_show_qr')}
                                        </Button>
                                    )}
                                    <Button
                                        size='sm'
                                        variant='light'
                                        isLoading={refreshingOrder}
                                        isDisabled={cancelingOrder}
                                        onPress={handleRefreshOrderStatus}
                                    >
                                        {t('config.account.payment_refresh')}
                                    </Button>
                                    {!isTerminalOrderStatus(paymentFlowOrder.status) && (
                                        <Button
                                            size='sm'
                                            variant='light'
                                            color='danger'
                                            isLoading={cancelingOrder}
                                            isDisabled={refreshingOrder}
                                            onPress={handleCancelLatestOrder}
                                        >
                                            {t('config.account.payment_cancel_order')}
                                        </Button>
                                    )}
                                </div>
                                {!isTerminalOrderStatus(paymentFlowOrder.status) && (
                                    <p className='text-[11px] text-default-400'>
                                        {t('config.account.payment_cancel_order_hint')}
                                    </p>
                                )}
                            </div>
                        )}
                    </ModalBody>
                </ModalContent>
            </Modal>

            <Modal
                isOpen={qrModalOpen}
                onOpenChange={setQrModalOpen}
                placement='center'
            >
                <ModalContent>
                    <ModalHeader className='flex flex-col gap-1'>{t('config.account.payment_qr_title')}</ModalHeader>
                    <ModalBody className='pb-6'>
                        <p className='text-sm text-default-500'>{t('config.account.payment_qr_desc')}</p>
                        {qrCodeDataUrl ? (
                            <img
                                src={qrCodeDataUrl}
                                alt='payment qr code'
                                className='mx-auto h-72 w-72 rounded-xl border border-default-200 bg-white p-3'
                            />
                        ) : (
                            <div className='mx-auto flex h-72 w-72 items-center justify-center rounded-xl border border-default-200 text-sm text-default-400'>
                                {t('config.account.payment_qr_loading')}
                            </div>
                        )}
                    </ModalBody>
                </ModalContent>
            </Modal>
        </div>
    );
}
