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

export default function Account() {
    const { t } = useTranslation();
    const [userInfo, setUserInfo] = useState(null);
    const [paymentConfig, setPaymentConfig] = useState(null);
    const [billingProfile, setBillingProfile] = useState(null);
    const [billingCatalog, setBillingCatalog] = useState(null);
    const [billingLoading, setBillingLoading] = useState(false);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [rechargeAmount, setRechargeAmount] = useState('29');
    const [activePurchaseKey, setActivePurchaseKey] = useState('');
    const [refreshingOrder, setRefreshingOrder] = useState(false);
    const [cancelingOrder, setCancelingOrder] = useState(false);
    const [latestOrder, setLatestOrder] = useState(null);
    const [selectedPaymentProvider, setSelectedPaymentProvider] = useState('');
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
    const [qrModalOpen, setQrModalOpen] = useState(false);
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

    const pollingInFlightRef = useRef(false);
    const successNoticeRef = useRef(new Set());
    const terminalNoticeRef = useRef(new Set());
    const adminUserPrefilledRef = useRef(false);

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

    async function loadBillingCatalog({ silent = false } = {}) {
        if (!userInfo?.id) return;
        if (!silent) setCatalogLoading(true);
        try {
            const data = await getBillingCatalog();
            setBillingCatalog(data?.catalog || null);
        } catch (error) {
            if (!silent) {
                toast.error(error.message || t('config.account.billing_catalog_load_failed'));
            }
        } finally {
            if (!silent) setCatalogLoading(false);
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

    async function handleCreateRechargeOrder() {
        const amount = Number(rechargeAmount);
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
    const latestOrderQrPayload = getOrderQrPayload(latestOrder);
    const subscriptionPlans = sortSubscriptionPlans(billingCatalog?.subscriptionPlans || []);
    const topupPresets = billingCatalog?.topupPresets || [];
    const estimatedRechargeCredits =
        billingCatalog?.topupCreditsPerCny && Number.isFinite(Number(rechargeAmount))
            ? Math.max(0, Math.floor(Number(rechargeAmount) * Number(billingCatalog.topupCreditsPerCny)))
            : null;
    const activeAdminToken = String(adminTokenInput || '').trim();
    const hasSavedAdminToken = Boolean(savedAdminToken);
    const adminTokenDirty = activeAdminToken !== savedAdminToken;
    const adminRefundMeta = adminManagedOrder?.metadata?.refund || null;

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
                    <CardBody className='flex flex-row items-center gap-4 py-4'>
                        <Avatar
                            name={userInfo.display_name?.charAt(0)?.toUpperCase() ?? 'U'}
                            size='lg'
                            classNames={{
                                base: 'bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6]',
                                name: 'text-white font-bold text-lg',
                            }}
                        />
                        <div className='min-w-0 flex-1'>
                            <div className='flex items-center gap-2'>
                                <p className='truncate font-semibold text-default-800'>{userInfo.display_name}</p>
                                <Chip
                                    size='sm'
                                    color={tierConfig.color}
                                    variant='flat'
                                    className='text-xs'
                                >
                                    {t(`config.account.tier_${tierConfig.key}`)}
                                </Chip>
                            </div>
                            <p className='mt-0.5 truncate text-xs text-default-400'>{userInfo.email}</p>
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
                            <div className='space-y-2'>
                                <div className='flex items-center gap-2'>
                                    <Chip
                                        size='sm'
                                        color={tierConfig.color}
                                        variant='flat'
                                        className='text-[10px]'
                                    >
                                        {t(`config.account.tier_${tierConfig.key}`)}
                                    </Chip>
                                    <Chip
                                        size='sm'
                                        color={getBillingStatusColor(billingProfile.status)}
                                        variant='flat'
                                        className='text-[10px]'
                                    >
                                        {getBillingStatusLabel(billingProfile.status)}
                                    </Chip>
                                </div>
                                <div className='space-y-1 text-xs text-default-500'>
                                    <p>
                                        {t('config.account.billing_daily_quota')}:
                                        <span className='ml-1 font-mono text-default-700'>
                                            {formatBillingQuota(billingProfile.dailyQuota)}
                                        </span>
                                    </p>
                                    <p>
                                        {t('config.account.billing_daily_used')}:
                                        <span className='ml-1 font-mono text-default-700'>
                                            {formatBillingValue(billingProfile.dailyQuotaUsed)}
                                        </span>
                                    </p>
                                    <p>
                                        {t('config.account.billing_daily_remaining')}:
                                        <span className='ml-1 font-mono text-default-700'>
                                            {formatBillingQuota(billingProfile.dailyQuotaRemaining)}
                                        </span>
                                    </p>
                                    <p>
                                        {t('config.account.billing_credits')}:
                                        <span className='ml-1 font-mono text-default-700'>
                                            {formatBillingValue(billingProfile.bonusCredits)}
                                        </span>
                                    </p>
                                    <p>
                                        {t('config.account.billing_total_requests')}:
                                        <span className='ml-1 font-mono text-default-700'>
                                            {formatBillingValue(billingProfile.aiRequestsTotal)}
                                        </span>
                                    </p>
                                    <p>
                                        {t('config.account.billing_subscription_expires')}:
                                        <span className='ml-1 font-mono text-default-700'>
                                            {formatBillingDateTime(billingProfile.subscriptionExpiresAt)}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className='text-xs text-default-500'>{t('config.account.billing_not_ready')}</p>
                        )}
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

                        <p className='text-xs text-default-500'>{t('config.account.subscription_subtitle')}</p>

                        {subscriptionPlans.length > 0 ? (
                            <div className='grid gap-3'>
                                {subscriptionPlans.map((plan) => {
                                    const planTierConfig = TIER_KEYS[plan.tier] ?? TIER_KEYS.free;
                                    return (
                                        <div
                                            key={plan.productCode}
                                            className='space-y-3 rounded-xl border border-default-200 p-3'
                                        >
                                            <div className='flex items-start justify-between gap-3'>
                                                <div className='space-y-1'>
                                                    <div className='flex items-center gap-2'>
                                                        <Chip
                                                            size='sm'
                                                            color={planTierConfig.color}
                                                            variant='flat'
                                                            className='text-[10px]'
                                                        >
                                                            {t(`config.account.tier_${planTierConfig.key}`)}
                                                        </Chip>
                                                        <Chip
                                                            size='sm'
                                                            variant='bordered'
                                                            className='text-[10px]'
                                                        >
                                                            {t(
                                                                `config.account.subscription_cycle_${plan.billingCycle}`
                                                            )}
                                                        </Chip>
                                                    </div>
                                                    <p className='text-sm font-semibold text-default-800'>
                                                        {t(`config.account.tier_${planTierConfig.key}`)}{' '}
                                                        {t(`config.account.subscription_cycle_${plan.billingCycle}`)}
                                                    </p>
                                                    <p className='text-xs text-default-500'>{plan.productCode}</p>
                                                </div>
                                                <div className='text-right'>
                                                    <p className='text-lg font-semibold text-default-800'>
                                                        {formatMoney(plan.amount, plan.currency)}
                                                    </p>
                                                    <p className='text-xs text-default-500'>
                                                        {t('config.account.subscription_duration_value', {
                                                            value: plan.durationDays,
                                                        })}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className='space-y-1 text-xs text-default-500'>
                                                <p>{formatPlanQuota(plan)}</p>
                                                {plan.allowCreditFallback && (
                                                    <p>{t('config.account.subscription_credit_fallback')}</p>
                                                )}
                                            </div>

                                            <Button
                                                size='sm'
                                                color='primary'
                                                isLoading={activePurchaseKey === plan.productCode}
                                                isDisabled={selectedProviderDetail?.ready === false}
                                                onPress={() => handlePurchaseSubscription(plan)}
                                            >
                                                {t('config.account.subscription_buy')}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className='text-xs text-default-500'>{t('config.account.subscription_not_ready')}</p>
                        )}

                        <p className='text-xs text-default-400'>{t('config.account.subscription_renewal_note')}</p>
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

                        <div className='space-y-2'>
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
                                                Number(rechargeAmount) === Number(preset.amount) ? 'solid' : 'bordered'
                                            }
                                            color='primary'
                                            onPress={() => setRechargeAmount(String(preset.amount))}
                                        >
                                            {formatMoney(preset.amount, preset.currency)}
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className='flex flex-wrap items-end gap-2'>
                            <Input
                                type='number'
                                min={0.01}
                                step={0.01}
                                size='sm'
                                label={t('config.account.payment_amount')}
                                value={rechargeAmount}
                                onValueChange={setRechargeAmount}
                                className='max-w-[180px]'
                            />
                            <Button
                                size='sm'
                                color='primary'
                                isLoading={activePurchaseKey === 'topup_custom'}
                                isDisabled={selectedProviderDetail?.ready === false}
                                onPress={handleCreateRechargeOrder}
                            >
                                {t('config.account.payment_create')}
                            </Button>
                        </div>

                        {estimatedRechargeCredits !== null && (
                            <p className='text-xs text-default-500'>
                                {t('config.account.topup_credit_estimate')}:
                                <span className='ml-1 font-mono text-default-700'>{estimatedRechargeCredits}</span>
                            </p>
                        )}

                        {latestOrder && (
                            <div className='space-y-2 rounded-lg border border-default-200 p-3'>
                                <div className='flex items-center justify-between gap-2'>
                                    <p className='text-xs text-default-600'>
                                        {t('config.account.payment_latest_order')}:
                                        <span className='ml-1 font-mono'>{latestOrder.id}</span>
                                    </p>
                                    <Chip
                                        size='sm'
                                        color={getStatusColor(latestOrder.status)}
                                        variant='flat'
                                        className='text-[10px]'
                                    >
                                        {latestOrder.status}
                                    </Chip>
                                </div>
                                <p className='text-xs text-default-500'>
                                    {t('config.account.payment_order_amount')}:
                                    <span className='ml-1 text-default-700'>{formatOrderAmount(latestOrder)}</span>
                                </p>
                                <p className='text-xs text-default-500'>
                                    {t('config.account.payment_provider_label')}:
                                    <span className='ml-1 text-default-700'>
                                        {getProviderDisplayName(latestOrder.provider)}
                                    </span>
                                </p>
                                <p className='text-xs text-default-500'>
                                    {t('config.account.payment_order_type')}:
                                    <span className='ml-1 text-default-700'>
                                        {getOrderTypeLabel(latestOrder.orderType)}
                                    </span>
                                </p>
                                {latestOrder.productCode && (
                                    <p className='text-xs text-default-500'>
                                        {t('config.account.payment_order_product')}:
                                        <span className='ml-1 text-default-700'>{latestOrder.productCode}</span>
                                    </p>
                                )}
                                {!isTerminalOrderStatus(latestOrder.status) && (
                                    <p className='text-xs text-primary-500'>{t('config.account.payment_polling')}</p>
                                )}
                                {latestOrderQrPayload && (
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
                                    {!latestOrderQrPayload && (
                                        <Button
                                            size='sm'
                                            variant='bordered'
                                            isDisabled={!latestOrder.checkoutUrl}
                                            onPress={() => openCheckout(latestOrder.checkoutUrl)}
                                        >
                                            {t('config.account.payment_open_checkout')}
                                        </Button>
                                    )}
                                    {latestOrderQrPayload && (
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
                                    {!isTerminalOrderStatus(latestOrder.status) && (
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
                                {!isTerminalOrderStatus(latestOrder.status) && (
                                    <p className='text-[11px] text-default-400'>
                                        {t('config.account.payment_cancel_order_hint')}
                                    </p>
                                )}
                            </div>
                        )}
                    </CardBody>
                </Card>
            )}

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
