import React, { useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Avatar, Button, Card, CardBody, Chip, Input } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';

import { getCurrentUser } from '../utils/auth';
import { clearStoredAdminToken, getStoredAdminToken, saveStoredAdminToken } from '../utils/admin';
import { getBillingProfile, updateAdminMembership, updateAdminMembershipTier } from '../utils/billing';
import { getPaymentOrderStatus, refundPaymentOrder } from '../utils/payment';

const TIER_KEYS = {
    free: { key: 'free', color: 'default' },
    basic: { key: 'basic', color: 'primary' },
    pro: { key: 'pro', color: 'secondary' },
    enterprise: { key: 'enterprise', color: 'warning' },
};

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

function formatMoney(amount, currency = 'CNY') {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return `0.00 ${currency}`;
    return `${numeric.toFixed(2)} ${currency}`;
}

function formatOrderAmount(order) {
    if (!order) return '-';
    const amount = Number(order.amountCents || 0) / 100;
    return formatMoney(amount, order.currency || 'CNY');
}

function getStatusColor(status) {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'PAID' || normalized === 'COMPLETED') return 'success';
    if (normalized === 'FAILED' || normalized === 'CANCELED') return 'danger';
    if (normalized === 'REFUNDED') return 'warning';
    return 'primary';
}

function formatBillingValue(t, value) {
    if (value === null || value === undefined || value === '') {
        return t('config.account.billing_none');
    }
    return String(value);
}

function formatBillingDateTime(t, value) {
    if (!value) return t('config.account.billing_none');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
}

function formatBillingQuota(t, value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric < 0) return t('config.account.billing_unlimited');
    if (!Number.isFinite(numeric)) return '0';
    return String(numeric);
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

function getBillingStatusLabel(t, status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'active') return t('config.account.billing_status_active');
    if (normalized === 'inactive') return t('config.account.billing_status_inactive');
    if (normalized === 'suspended') return t('config.account.billing_status_suspended');
    if (normalized === 'canceled' || normalized === 'cancelled') {
        return t('config.account.billing_status_canceled');
    }
    return formatBillingValue(t, status).toUpperCase();
}

function getOrderTypeLabel(t, orderType) {
    const normalized = String(orderType || '')
        .trim()
        .toLowerCase();
    if (normalized === 'subscription') return t('config.account.order_type_subscription');
    if (normalized === 'topup') return t('config.account.order_type_topup');
    return normalized || '-';
}

function getAdminReverseReasonLabel(t, reason) {
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

export default function AdminBillingPage() {
    const { t } = useTranslation();
    const [userInfo, setUserInfo] = useState(null);
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
    const [adminTierTarget, setAdminTierTarget] = useState('basic');
    const [adminTierDurationDays, setAdminTierDurationDays] = useState('');
    const [adminTierReason, setAdminTierReason] = useState('');
    const [adminTierActionLoading, setAdminTierActionLoading] = useState(false);

    useEffect(() => {
        const { user } = getCurrentUser();
        setUserInfo(user);
    }, []);

    useEffect(() => {
        const storedToken = getStoredAdminToken();
        setSavedAdminToken(storedToken);
        setAdminTokenInput(storedToken);
    }, []);

    useEffect(() => {
        if (userInfo?.id && !adminUserId) {
            setAdminUserId(String(userInfo.id));
        }
    }, [userInfo?.id, adminUserId]);

    useEffect(() => {
        const currentTier = String(adminManagedProfile?.tier || '')
            .trim()
            .toLowerCase();
        if (currentTier && TIER_KEYS[currentTier]) {
            setAdminTierTarget(currentTier);
        }
    }, [adminManagedProfile?.tier]);

    function getAdminTokenOrNotify() {
        const token = String(adminTokenInput || '').trim();
        if (!token) {
            toast.error(t('config.account.admin_token_required'));
            return '';
        }
        return token;
    }

    async function loadManagedProfile(targetUserId, token, { silent = false } = {}) {
        if (!targetUserId || !token) return null;
        if (!silent) setAdminProfileLookupLoading(true);
        try {
            const result = await getBillingProfile(targetUserId, { adminToken: token });
            const profile = result?.profile || null;
            setAdminManagedProfile(profile);
            return profile;
        } catch (error) {
            if (!silent) {
                toast.error(error.message || t('config.account.admin_membership_lookup_failed'));
            }
            return null;
        } finally {
            if (!silent) setAdminProfileLookupLoading(false);
        }
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
                await loadManagedProfile(String(order.userId), token, { silent: true });
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
            }
            if (result?.refund?.reverseResult?.profile) {
                setAdminManagedProfile(result.refund.reverseResult.profile);
            } else if (order?.userId) {
                await loadManagedProfile(String(order.userId), token, { silent: true });
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

    async function handleAdminMembershipLookup() {
        const token = getAdminTokenOrNotify();
        if (!token) return;
        const targetUserId = String(adminUserId || '').trim();
        if (!targetUserId) {
            toast.error(t('config.account.admin_requires_user_id'));
            return;
        }

        const profile = await loadManagedProfile(targetUserId, token, { silent: false });
        if (profile) {
            toast.success(t('config.account.admin_membership_lookup_success'));
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

    async function handleAdminTierChange() {
        const token = getAdminTokenOrNotify();
        if (!token) return;
        const targetUserId = String(adminUserId || '').trim();
        if (!targetUserId) {
            toast.error(t('config.account.admin_requires_user_id'));
            return;
        }

        setAdminTierActionLoading(true);
        try {
            const result = await updateAdminMembershipTier({
                userId: targetUserId,
                targetTier: adminTierTarget,
                durationDays: adminTierDurationDays,
                reason: adminTierReason,
                adminToken: token,
            });
            setAdminManagedProfile(result?.profile || null);
            setAdminTierDurationDays('');
            toast.success(t('config.account.admin_tier_apply_success'));
        } catch (error) {
            toast.error(error.message || t('config.account.admin_tier_apply_failed'));
        } finally {
            setAdminTierActionLoading(false);
        }
    }

    const activeAdminToken = String(adminTokenInput || '').trim();
    const hasSavedAdminToken = Boolean(savedAdminToken);
    const adminTokenDirty = activeAdminToken !== savedAdminToken;
    const adminRefundMeta = adminManagedOrder?.metadata?.refund || null;
    const adminTierConfig = TIER_KEYS[adminManagedProfile?.tier] ?? TIER_KEYS.free;

    return (
        <div className='min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_45%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,1))] p-4 text-default-700 sm:p-6'>
            <Toaster
                position='top-center'
                toastOptions={{ duration: 2500, style: { fontSize: '13px', borderRadius: '10px' } }}
            />

            <div className='mx-auto max-w-6xl space-y-4'>
                <Card
                    shadow='none'
                    className='border-1 border-default-100 bg-white/80 backdrop-blur'
                >
                    <CardBody className='space-y-3'>
                        <div className='space-y-1'>
                            <p className='text-xs font-semibold uppercase tracking-[0.24em] text-primary-500'>
                                Flow Input
                            </p>
                            <div className='flex flex-wrap items-center justify-between gap-3'>
                                <div className='space-y-1'>
                                    <h1 className='text-2xl font-semibold text-default-900'>
                                        {t('config.account.admin_title')}
                                    </h1>
                                    <p className='text-sm text-default-500'>
                                        {t('config.account.admin_subtitle')}
                                    </p>
                                </div>
                                <Chip
                                    size='sm'
                                    variant='flat'
                                    color='primary'
                                    className='text-[10px]'
                                >
                                    /admin/billing
                                </Chip>
                            </div>
                        </div>

                        {userInfo?.id && (
                            <div className='flex items-center gap-3 rounded-xl border border-default-200 bg-default-50/60 p-3'>
                                <Avatar
                                    name={userInfo.display_name?.charAt(0)?.toUpperCase() ?? 'U'}
                                    size='md'
                                    classNames={{
                                        base: 'bg-gradient-to-br from-[#0f766e] to-[#2563eb]',
                                        name: 'text-white font-semibold',
                                    }}
                                />
                                <div className='min-w-0 flex-1'>
                                    <p className='truncate text-sm font-semibold text-default-700'>
                                        {userInfo.display_name || userInfo.email || userInfo.id}
                                    </p>
                                    <p className='truncate font-mono text-xs text-default-400'>{userInfo.id}</p>
                                </div>
                            </div>
                        )}
                    </CardBody>
                </Card>

                <Card
                    shadow='none'
                    className='border-1 border-default-100 bg-white/80 backdrop-blur'
                >
                    <CardBody className='space-y-3'>
                        <div className='flex items-center justify-between gap-2'>
                            <p className='text-sm font-semibold text-default-800'>
                                {t('config.account.admin_token_label')}
                            </p>
                            <Chip
                                size='sm'
                                color={hasSavedAdminToken && !adminTokenDirty ? 'success' : 'default'}
                                variant='flat'
                                className='text-[10px]'
                            >
                                {hasSavedAdminToken && !adminTokenDirty
                                    ? t('config.account.admin_token_status_saved')
                                    : t('config.account.admin_token_status_unsaved')}
                            </Chip>
                        </div>
                        <Input
                            type='password'
                            size='sm'
                            label={t('config.account.admin_token_label')}
                            placeholder={t('config.account.admin_token_placeholder')}
                            value={adminTokenInput}
                            onValueChange={setAdminTokenInput}
                        />
                        <p className='text-xs text-default-400'>{t('config.account.admin_token_hint')}</p>
                        <div className='flex flex-wrap gap-2'>
                            <Button
                                size='sm'
                                color='primary'
                                onPress={handleSaveAdminToken}
                            >
                                {t('config.account.admin_token_save')}
                            </Button>
                            <Button
                                size='sm'
                                variant='light'
                                color='danger'
                                onPress={handleClearAdminToken}
                            >
                                {t('config.account.admin_token_clear')}
                            </Button>
                        </div>
                    </CardBody>
                </Card>

                <div className='grid gap-4 xl:grid-cols-2'>
                    <Card
                        shadow='none'
                        className='border-1 border-default-100 bg-white/80 backdrop-blur'
                    >
                        <CardBody className='space-y-3'>
                            <div className='space-y-1'>
                                <p className='text-sm font-semibold text-default-800'>
                                    {t('config.account.admin_order_title')}
                                </p>
                                <p className='text-xs text-default-500'>
                                    {t('config.account.admin_order_subtitle')}
                                </p>
                            </div>

                            <Input
                                size='sm'
                                label={t('config.account.admin_order_id')}
                                value={adminOrderId}
                                onValueChange={setAdminOrderId}
                            />
                            <Input
                                size='sm'
                                label={t('config.account.admin_order_refund_reason')}
                                value={adminRefundReason}
                                onValueChange={setAdminRefundReason}
                            />

                            <div className='flex flex-wrap gap-2'>
                                <Button
                                    size='sm'
                                    variant='bordered'
                                    isLoading={adminOrderLookupLoading}
                                    onPress={handleAdminOrderLookup}
                                >
                                    {t('config.account.admin_order_lookup')}
                                </Button>
                                <Button
                                    size='sm'
                                    color='danger'
                                    isLoading={adminRefundLoading}
                                    onPress={handleAdminRefund}
                                >
                                    {t('config.account.admin_order_refund')}
                                </Button>
                            </div>

                            {adminManagedOrder ? (
                                <div className='space-y-2 rounded-xl border border-default-200 p-3'>
                                    <div className='flex items-center justify-between gap-2'>
                                        <p className='text-xs text-default-600'>
                                            {t('config.account.payment_latest_order')}:
                                            <span className='ml-1 font-mono'>{adminManagedOrder.id}</span>
                                        </p>
                                        <Chip
                                            size='sm'
                                            color={getStatusColor(adminManagedOrder.status)}
                                            variant='flat'
                                            className='text-[10px]'
                                        >
                                            {adminManagedOrder.status}
                                        </Chip>
                                    </div>
                                    <div className='space-y-1 text-xs text-default-500'>
                                        <p>
                                            {t('config.account.admin_order_user_id')}:
                                            <span className='ml-1 font-mono text-default-700'>
                                                {formatBillingValue(t, adminManagedOrder.userId)}
                                            </span>
                                        </p>
                                        <p>
                                            {t('config.account.payment_order_amount')}:
                                            <span className='ml-1 text-default-700'>
                                                {formatOrderAmount(adminManagedOrder)}
                                            </span>
                                        </p>
                                        <p>
                                            {t('config.account.payment_provider_label')}:
                                            <span className='ml-1 text-default-700'>
                                                {getProviderDisplayName(adminManagedOrder.provider)}
                                            </span>
                                        </p>
                                        <p>
                                            {t('config.account.payment_order_type')}:
                                            <span className='ml-1 text-default-700'>
                                                {getOrderTypeLabel(t, adminManagedOrder.orderType)}
                                            </span>
                                        </p>
                                        {adminManagedOrder.productCode && (
                                            <p>
                                                {t('config.account.payment_order_product')}:
                                                <span className='ml-1 text-default-700'>
                                                    {adminManagedOrder.productCode}
                                                </span>
                                            </p>
                                        )}
                                        {adminRefundMeta && (
                                            <>
                                                <p>
                                                    {t('config.account.admin_order_refund_status')}:
                                                    <span className='ml-1 text-default-700'>
                                                        {formatBillingValue(t, adminRefundMeta.status)}
                                                    </span>
                                                </p>
                                                <p>
                                                    {t('config.account.admin_order_refund_rollback')}:
                                                    <span className='ml-1 text-default-700'>
                                                        {adminRefundMeta.reversedGrant
                                                            ? t('config.account.admin_order_refund_reversed')
                                                            : t(
                                                                  'config.account.admin_order_refund_reverse_pending'
                                                              )}
                                                    </span>
                                                </p>
                                                {(adminRefundMeta.reverseReason ||
                                                    !adminRefundMeta.reversedGrant) && (
                                                    <p>
                                                        {t('config.account.admin_order_refund_reason_label')}:
                                                        <span className='ml-1 text-default-700'>
                                                            {adminRefundMeta.reverseReason
                                                                ? getAdminReverseReasonLabel(
                                                                      t,
                                                                      adminRefundMeta.reverseReason
                                                                  )
                                                                : t(
                                                                      'config.account.admin_order_refund_reverse_pending'
                                                                  )}
                                                        </span>
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p className='text-xs text-default-500'>
                                    {t('config.account.admin_order_not_ready')}
                                </p>
                            )}
                        </CardBody>
                    </Card>

                    <Card
                        shadow='none'
                        className='border-1 border-default-100 bg-white/80 backdrop-blur'
                    >
                        <CardBody className='space-y-3'>
                            <div className='space-y-1'>
                                <p className='text-sm font-semibold text-default-800'>
                                    {t('config.account.admin_membership_title')}
                                </p>
                                <p className='text-xs text-default-500'>
                                    {t('config.account.admin_membership_subtitle')}
                                </p>
                            </div>

                            <Input
                                size='sm'
                                label={t('config.account.admin_user_id')}
                                value={adminUserId}
                                onValueChange={setAdminUserId}
                            />
                            {userInfo?.id && (
                                <div className='flex justify-start'>
                                    <Button
                                        size='sm'
                                        variant='light'
                                        onPress={() => setAdminUserId(String(userInfo.id))}
                                    >
                                        {t('config.account.admin_use_current_user')}
                                    </Button>
                                </div>
                            )}
                            <Input
                                size='sm'
                                label={t('config.account.admin_membership_reason')}
                                value={adminMembershipReason}
                                onValueChange={setAdminMembershipReason}
                            />

                            <div className='flex flex-wrap gap-2'>
                                <Button
                                    size='sm'
                                    variant='bordered'
                                    isLoading={adminProfileLookupLoading}
                                    onPress={handleAdminMembershipLookup}
                                >
                                    {t('config.account.admin_membership_lookup')}
                                </Button>
                                <Button
                                    size='sm'
                                    color='warning'
                                    isLoading={adminMembershipAction === 'suspend'}
                                    onPress={() => handleAdminMembershipAction('suspend')}
                                >
                                    {t('config.account.admin_membership_suspend')}
                                </Button>
                                <Button
                                    size='sm'
                                    color='success'
                                    isLoading={adminMembershipAction === 'resume'}
                                    onPress={() => handleAdminMembershipAction('resume')}
                                >
                                    {t('config.account.admin_membership_resume')}
                                </Button>
                            </div>

                            {adminManagedProfile ? (
                                <div className='space-y-2 rounded-xl border border-default-200 p-3'>
                                    <div className='flex items-center gap-2'>
                                        <Chip
                                            size='sm'
                                            color={adminTierConfig.color}
                                            variant='flat'
                                            className='text-[10px]'
                                        >
                                            {t(`config.account.tier_${adminTierConfig.key}`)}
                                        </Chip>
                                        <Chip
                                            size='sm'
                                            color={getBillingStatusColor(adminManagedProfile.status)}
                                            variant='flat'
                                            className='text-[10px]'
                                        >
                                            {getBillingStatusLabel(t, adminManagedProfile.status)}
                                        </Chip>
                                    </div>
                                    <div className='space-y-1 text-xs text-default-500'>
                                        <p>
                                            {t('config.account.admin_user_id')}:
                                            <span className='ml-1 font-mono text-default-700'>
                                                {formatBillingValue(t, adminUserId)}
                                            </span>
                                        </p>
                                        <p>
                                            {t('config.account.billing_daily_quota')}:
                                            <span className='ml-1 font-mono text-default-700'>
                                                {formatBillingQuota(t, adminManagedProfile.dailyQuota)}
                                            </span>
                                        </p>
                                        <p>
                                            {t('config.account.billing_daily_used')}:
                                            <span className='ml-1 font-mono text-default-700'>
                                                {formatBillingValue(t, adminManagedProfile.dailyQuotaUsed)}
                                            </span>
                                        </p>
                                        <p>
                                            {t('config.account.billing_daily_remaining')}:
                                            <span className='ml-1 font-mono text-default-700'>
                                                {formatBillingQuota(t, adminManagedProfile.dailyQuotaRemaining)}
                                            </span>
                                        </p>
                                        <p>
                                            {t('config.account.billing_credits')}:
                                            <span className='ml-1 font-mono text-default-700'>
                                                {formatBillingValue(t, adminManagedProfile.bonusCredits)}
                                            </span>
                                        </p>
                                        <p>
                                            {t('config.account.billing_subscription_expires')}:
                                            <span className='ml-1 font-mono text-default-700'>
                                                {formatBillingDateTime(
                                                    t,
                                                    adminManagedProfile.subscriptionExpiresAt
                                                )}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <p className='text-xs text-default-500'>
                                    {t('config.account.admin_membership_empty')}
                                </p>
                            )}
                        </CardBody>
                    </Card>
                </div>

                <Card
                    shadow='none'
                    className='border-1 border-default-100 bg-white/80 backdrop-blur'
                >
                    <CardBody className='space-y-3'>
                        <div className='space-y-1'>
                            <p className='text-sm font-semibold text-default-800'>
                                {t('config.account.admin_tier_title')}
                            </p>
                            <p className='text-xs text-default-500'>
                                {t('config.account.admin_tier_subtitle')}
                            </p>
                        </div>

                        <Input
                            size='sm'
                            label={t('config.account.admin_user_id')}
                            value={adminUserId}
                            onValueChange={setAdminUserId}
                        />
                        {userInfo?.id && (
                            <div className='flex justify-start'>
                                <Button
                                    size='sm'
                                    variant='light'
                                    onPress={() => setAdminUserId(String(userInfo.id))}
                                >
                                    {t('config.account.admin_use_current_user')}
                                </Button>
                            </div>
                        )}
                        <label className='space-y-1 text-sm text-default-700'>
                            <span className='font-medium'>{t('config.account.admin_tier_target')}</span>
                            <select
                                className='w-full rounded-xl border border-default-200 bg-white px-3 py-2 text-sm text-default-700 outline-none transition focus:border-primary'
                                value={adminTierTarget}
                                onChange={(event) => setAdminTierTarget(event.target.value)}
                            >
                                {Object.values(TIER_KEYS).map((item) => (
                                    <option key={item.key} value={item.key}>
                                        {t(`config.account.tier_${item.key}`)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <Input
                            size='sm'
                            type='number'
                            min='0'
                            label={t('config.account.admin_tier_duration_days')}
                            placeholder='30'
                            value={adminTierDurationDays}
                            onValueChange={setAdminTierDurationDays}
                        />
                        <p className='text-xs text-default-400'>
                            {t('config.account.admin_tier_duration_hint')}
                        </p>
                        <Input
                            size='sm'
                            label={t('config.account.admin_membership_reason')}
                            value={adminTierReason}
                            onValueChange={setAdminTierReason}
                        />

                        <div className='flex flex-wrap gap-2'>
                            <Button
                                size='sm'
                                color='primary'
                                isLoading={adminTierActionLoading}
                                onPress={handleAdminTierChange}
                            >
                                {t('config.account.admin_tier_apply')}
                            </Button>
                        </div>
                    </CardBody>
                </Card>
            </div>
        </div>
    );
}
