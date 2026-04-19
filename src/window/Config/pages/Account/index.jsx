import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    Skeleton,
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

function toInviteToken(value) {
    return String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();
}

function getInviteCode(profile, user) {
    const profileCode = toInviteToken(profile?.inviteCode);
    if (profileCode) return profileCode.slice(0, 8);

    const idCode = toInviteToken(user?.id);
    if (idCode) return idCode.slice(0, 8);

    const emailPrefix = String(user?.email || '')
        .split('@')[0]
        .trim();
    const emailCode = toInviteToken(emailPrefix);
    if (emailCode) return emailCode.slice(0, 8);

    return '';
}

function buildInviteLink(inviteCode) {
    const code = String(inviteCode || '').trim();
    if (!code) return '';

    const explicitBase = String(
        import.meta.env.VITE_APP_BASE_URL || import.meta.env.VITE_AUTH_API_BASE || ''
    )
        .trim()
        .replace(/\/api\/?$/i, '');
    const fallbackBase =
        typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const base = explicitBase || fallbackBase;

    try {
        const url = new URL(base);
        url.search = '';
        url.hash = '';
        url.searchParams.set('invite', code);
        return url.toString();
    } catch {
        return '';
    }
}

function pickFirstFiniteNumber(...values) {
    for (const value of values) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
    }
    return 0;
}

function resolveInviteStats(profile, user) {
    const inviteStats = profile?.inviteStats || user?.inviteStats || {};
    return {
        invitedCount: pickFirstFiniteNumber(
            inviteStats?.invitedCount,
            inviteStats?.inviteCount,
            inviteStats?.totalInvites,
            profile?.invitedCount,
            profile?.inviteCount,
            user?.invitedCount,
            user?.inviteCount
        ),
        pendingCount: pickFirstFiniteNumber(
            inviteStats?.pendingCount,
            inviteStats?.pendingClaimCount,
            inviteStats?.pendingRewardCount,
            profile?.pendingInviteCount,
            profile?.pendingClaimCount,
            user?.pendingInviteCount,
            user?.pendingClaimCount
        ),
        rewardedCredits: pickFirstFiniteNumber(
            inviteStats?.rewardedCredits,
            inviteStats?.earnedCredits,
            inviteStats?.claimedCredits,
            profile?.inviteRewardCredits,
            profile?.earnedInviteCredits,
            user?.inviteRewardCredits,
            user?.earnedInviteCredits
        ),
    };
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
const BILLING_REGION_CONFIG = Object.freeze({
    global: {
        key: 'global',
        labelKey: 'billing_region_global',
        providerNames: ['stripe'],
    },
    cn: {
        key: 'cn',
        labelKey: 'billing_region_cn',
        providerNames: ['alipay', 'wxpay', 'easypay'],
    },
});
const BILLING_REGION_ORDER = Object.freeze(['global', 'cn']);
const PLAN_CARD_STYLES = Object.freeze({
    free: {
        border: 'border-default-200',
        surface: 'from-white via-white to-white',
        accent: 'bg-default-400',
        badge: 'bg-default-100 text-default-700',
    },
    basic: {
        border: 'border-default-200',
        surface: 'from-white via-white to-white',
        accent: 'bg-default-400',
        badge: 'bg-default-100 text-default-700',
    },
    pro: {
        border: 'border-default-200',
        surface: 'from-white via-white to-white',
        accent: 'bg-default-400',
        badge: 'bg-default-100 text-default-700',
    },
});
const PLAN_CTA_TONE_STYLES = Object.freeze({
    neutral: 'border border-default-200 bg-default-100 text-default-600 hover:bg-default-200/70',
    primary: 'bg-default-900 text-white hover:bg-default-800',
    secondary: 'bg-default-900 text-white hover:bg-default-800',
});
const ACCOUNT_VIEW_CACHE = {
    paymentConfig: null,
    billingProfilesByUserId: new Map(),
    billingCatalogsByKey: new Map(),
    lastBillingCatalogKey: '',
    lastSelectedPaymentProvider: '',
};

function areDataEqual(currentValue, nextValue) {
    if (currentValue === nextValue) return true;
    try {
        return JSON.stringify(currentValue) === JSON.stringify(nextValue);
    } catch {
        return false;
    }
}

function updateStateIfChanged(setter, nextValue) {
    setter((currentValue) => (areDataEqual(currentValue, nextValue) ? currentValue : nextValue));
}

function getBillingCatalogCacheKey(regionKey, paymentProvider) {
    return `${String(regionKey || 'global').trim()}::${String(paymentProvider || '').trim()}`;
}

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

function getRegionProviderNames(regionKey) {
    return BILLING_REGION_CONFIG[regionKey]?.providerNames || [];
}

function filterProvidersByRegion(providerOptions, regionKey) {
    const allowedNames = getRegionProviderNames(regionKey);
    return (providerOptions || []).filter((item) =>
        allowedNames.includes(String(item?.name || '').trim().toLowerCase())
    );
}

function isProviderReadyForPurchase(provider) {
    return (provider?.createReady ?? provider?.ready) !== false;
}

function getPreferredProviderForRegion(providerOptions, regionKey, { readyOnly = false } = {}) {
    const regionProviders = filterProvidersByRegion(providerOptions, regionKey);
    if (readyOnly) {
        const readyProvider = regionProviders.find((item) => isProviderReadyForPurchase(item));
        if (readyProvider?.name) return String(readyProvider.name).trim();
    }
    return regionProviders[0]?.name ? String(regionProviders[0].name).trim() : '';
}

function getCatalogProviderForRegion(providerOptions, regionKey, selectedProvider = '') {
    const normalizedSelectedProvider = String(selectedProvider || '').trim().toLowerCase();
    const regionProviders = filterProvidersByRegion(providerOptions, regionKey);
    const hasSelectedProviderInRegion = regionProviders.some(
        (item) => String(item?.name || '').trim().toLowerCase() === normalizedSelectedProvider
    );
    if (normalizedSelectedProvider && hasSelectedProviderInRegion) {
        return String(selectedProvider).trim();
    }
    return (
        getPreferredProviderForRegion(providerOptions, regionKey, { readyOnly: true }) ||
        getPreferredProviderForRegion(providerOptions, regionKey) ||
        getRegionProviderNames(regionKey)[0] ||
        ''
    );
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

const AccountBillingPanel = React.memo(function AccountBillingPanel({
    viewModel,
    loading,
    onPrepareRechargeOrder,
    onCopyInviteLink,
}) {
    return (
        <Card
            shadow='none'
            className='h-full border-1 border-default-200 bg-white'
        >
            <CardBody className='p-4'>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='space-y-1'>
                        <p className='text-sm font-semibold text-default-900'>{viewModel.title}</p>
                        <p className='text-xs text-default-500'>{viewModel.subtitle}</p>
                    </div>
                    <Button
                        size='sm'
                        radius='md'
                        variant='flat'
                        color='primary'
                        isDisabled={!viewModel.hasReadyPaymentProvider}
                        onPress={onPrepareRechargeOrder}
                    >
                        {viewModel.purchaseActionLabel}
                    </Button>
                </div>

                {viewModel.ready ? (
                    <>
                        <div className='mt-4 grid grid-cols-2 gap-3'>
                            <div className='rounded-xl border border-default-200 bg-default-50/70 px-4 py-3'>
                                <p className='text-[11px] font-medium text-default-500'>
                                    {viewModel.dailyQuotaLabel}
                                </p>
                                <div className='mt-1.5 flex flex-wrap items-center gap-2'>
                                    <span className='text-2xl font-semibold tracking-tight text-default-900'>
                                        {viewModel.usageDisplay}
                                    </span>
                                    {viewModel.showUnlimitedBadge ? (
                                        <div className='inline-flex rounded-full border border-default-200 bg-white px-2.5 py-1 text-[11px] text-default-600'>
                                            {viewModel.unlimitedLabel}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className='rounded-xl border border-default-200 bg-default-50/70 px-4 py-3'>
                                <p className='text-[11px] font-medium text-default-500'>
                                    {viewModel.creditsLabel}
                                </p>
                                <p className='mt-1.5 text-2xl font-semibold tracking-tight text-default-900'>
                                    {viewModel.creditsDisplay}
                                </p>
                            </div>
                        </div>

                        <div className='mt-4 rounded-xl border border-default-200 bg-default-50/40 p-4'>
                            <div className='flex flex-wrap items-center gap-2.5'>
                                <span className='text-xs font-medium text-default-500'>
                                    {viewModel.inviteCodeLabel}
                                </span>
                                <span className='min-w-0 flex-1 truncate font-mono text-sm font-semibold tracking-[0.16em] text-default-800'>
                                    {viewModel.inviteCodeDisplay}
                                </span>
                                <button
                                    type='button'
                                    disabled={viewModel.inviteShareDisabled}
                                    className='inline-flex h-8 items-center justify-center rounded-lg border border-default-200 bg-white px-3 text-xs font-medium text-default-600 transition hover:border-default-300 hover:text-default-800 disabled:cursor-not-allowed disabled:opacity-50'
                                    title={viewModel.inviteShareLabel}
                                    onClick={onCopyInviteLink}
                                >
                                    {viewModel.inviteShareLabel}
                                </button>
                            </div>

                            <div className='mt-3 grid gap-2 sm:grid-cols-3'>
                                <div className='rounded-lg border border-default-200 bg-white px-3 py-2.5'>
                                    <p className='text-[11px] text-default-500'>
                                        {viewModel.invitedCountLabel}
                                    </p>
                                    <p className='mt-1 text-sm font-semibold text-default-800'>
                                        {viewModel.invitedCount}
                                    </p>
                                </div>
                                <div className='rounded-lg border border-default-200 bg-white px-3 py-2.5'>
                                    <p className='text-[11px] text-default-500'>
                                        {viewModel.pendingCountLabel}
                                    </p>
                                    <p className='mt-1 text-sm font-semibold text-default-800'>
                                        {viewModel.pendingCount}
                                    </p>
                                </div>
                                <div className='rounded-lg border border-default-200 bg-white px-3 py-2.5'>
                                    <p className='text-[11px] text-default-500'>
                                        {viewModel.rewardedCreditsLabel}
                                    </p>
                                    <p className='mt-1 text-sm font-semibold text-default-800'>
                                        {viewModel.rewardedCredits}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </>
                ) : loading ? (
                    <>
                        <div className='mt-4 grid grid-cols-2 gap-3'>
                            <div className='rounded-xl border border-default-200 bg-default-50/70 px-4 py-3'>
                                <Skeleton className='h-3 w-16 rounded-lg' />
                                <Skeleton className='mt-3 h-8 w-24 rounded-lg' />
                            </div>
                            <div className='rounded-xl border border-default-200 bg-default-50/70 px-4 py-3'>
                                <Skeleton className='h-3 w-16 rounded-lg' />
                                <Skeleton className='mt-3 h-8 w-16 rounded-lg' />
                            </div>
                        </div>

                        <div className='mt-4 rounded-xl border border-default-200 bg-default-50/40 p-4'>
                            <div className='flex flex-wrap items-center gap-2.5'>
                                <Skeleton className='h-3 w-14 rounded-lg' />
                                <Skeleton className='h-4 min-w-[160px] flex-1 rounded-lg' />
                                <Skeleton className='h-8 w-20 rounded-lg' />
                            </div>

                            <div className='mt-3 grid gap-2 sm:grid-cols-3'>
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div
                                        key={index}
                                        className='rounded-lg border border-default-200 bg-white px-3 py-2.5'
                                    >
                                        <Skeleton className='h-3 w-12 rounded-lg' />
                                        <Skeleton className='mt-2 h-5 w-10 rounded-lg' />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <p className='mt-3 text-xs text-default-500'>{viewModel.notReadyText}</p>
                )}
            </CardBody>
        </Card>
    );
});

const SubscriptionPlanHeaderStatic = React.memo(function SubscriptionPlanHeaderStatic({ viewModel }) {
    return (
        <>
            <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${viewModel.badgeClass}`}>
                {viewModel.tierLabel}
            </span>
            {viewModel.isRecommended ? (
                <Chip
                    size='sm'
                    color='secondary'
                    variant='flat'
                    className='text-[10px]'
                >
                    {viewModel.recommendedLabel}
                </Chip>
            ) : null}
        </>
    );
});

const SubscriptionPlanCurrentBadge = React.memo(function SubscriptionPlanCurrentBadge({
    isCurrentPlan,
    label,
}) {
    if (!isCurrentPlan) return null;
    return (
        <Chip
            size='sm'
            color='success'
            variant='flat'
            className='text-[10px]'
        >
            {label}
        </Chip>
    );
});

const SubscriptionPlanStaticBody = React.memo(function SubscriptionPlanStaticBody({
    viewModel,
    onSelectCycle,
    onPrepareSubscription,
}) {
    return (
        <>
            <div className='mt-3 flex items-start justify-between gap-3'>
                <div className='min-w-0 flex-1'>
                    <p className='text-2xl font-semibold tracking-tight text-default-900'>
                        {viewModel.priceLabel}
                        {viewModel.priceUnitLabel ? (
                            <span className='ml-1 text-sm font-normal text-default-400'>
                                {viewModel.priceUnitLabel}
                            </span>
                        ) : null}
                    </p>
                    <p className='mt-1 line-clamp-2 text-sm leading-6 text-default-500'>
                        {viewModel.description}
                    </p>
                    {viewModel.monthlyAverageLabel ? (
                        <p className='pt-1 text-xs text-default-500'>
                            {viewModel.monthlyAverageLabel}
                        </p>
                    ) : null}
                </div>

                {viewModel.availableCycles.length > 0 ? (
                    <div className='flex min-h-[64px] flex-col items-end justify-between gap-2'>
                        <div className='inline-flex rounded-lg border border-default-200 bg-default-50 p-0.5'>
                            {viewModel.availableCycles.map((cycle) => {
                                const active = viewModel.billingCycle === cycle.value;
                                return (
                                    <button
                                        key={`${viewModel.tier}_${cycle.value}`}
                                        type='button'
                                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                                            active
                                                ? 'bg-white text-default-900 shadow-sm'
                                                : 'text-default-500 hover:text-default-800'
                                        }`}
                                        onClick={() => onSelectCycle(viewModel.tier, cycle.value)}
                                    >
                                        {cycle.label}
                                    </button>
                                );
                            })}
                        </div>
                        <div className='min-h-[24px]'>
                            {viewModel.yearlySavingsLabel ? (
                                <div className='rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700'>
                                    {viewModel.yearlySavingsLabel}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </div>

            <div className='mt-2 rounded-xl border border-default-200 bg-default-50/70 px-3 py-3'>
                <p className='text-[11px] font-medium text-default-500'>{viewModel.dailyQuotaLabel}</p>
                <p className='mt-1 text-xl font-semibold tracking-tight text-default-900'>
                    {viewModel.dailyQuotaValue}
                </p>
            </div>

            <div className='mt-4 min-h-[24px] text-xs leading-6 text-default-600'>
                <div className='flex items-start gap-2'>
                    <span className={`mt-[8px] h-1.5 w-1.5 rounded-full ${viewModel.accentClass}`} />
                    <span>{viewModel.primaryFeatureLabel}</span>
                </div>
            </div>

            <div className='mt-4 w-full'>
                <button
                    type='button'
                    disabled={viewModel.ctaDisabled}
                    onClick={viewModel.isFreePlan ? undefined : () => onPrepareSubscription(viewModel.plan)}
                    className={`flex h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-medium transition-colors ${viewModel.ctaToneClass} ${
                        viewModel.ctaDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                    }`}
                >
                    {viewModel.ctaLabel}
                </button>
            </div>
        </>
    );
});

const SubscriptionPlanCard = React.memo(
    function SubscriptionPlanCard({ viewModel, isCurrentPlan, onSelectCycle, onPrepareSubscription }) {
        return (
            <div
                className={`relative flex h-full min-h-[272px] overflow-hidden rounded-2xl border bg-white p-4 transition-colors duration-150 hover:border-default-300 ${
                    viewModel.borderClass
                } ${isCurrentPlan ? 'ring-1 ring-default-200' : ''}`}
            >
                <div className='relative flex h-full w-full flex-col'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <SubscriptionPlanHeaderStatic viewModel={viewModel} />
                        <SubscriptionPlanCurrentBadge
                            isCurrentPlan={isCurrentPlan}
                            label={viewModel.currentPlanLabel}
                        />
                    </div>

                    <SubscriptionPlanStaticBody
                        viewModel={viewModel}
                        onSelectCycle={onSelectCycle}
                        onPrepareSubscription={onPrepareSubscription}
                    />
                </div>
            </div>
        );
    },
    (prevProps, nextProps) =>
        prevProps.viewModel === nextProps.viewModel &&
        prevProps.isCurrentPlan === nextProps.isCurrentPlan &&
        prevProps.onSelectCycle === nextProps.onSelectCycle &&
        prevProps.onPrepareSubscription === nextProps.onPrepareSubscription
);

const AccountSubscriptionPlansPanel = React.memo(function AccountSubscriptionPlansPanel({
    title,
    subtitle,
    emptyText,
    loading,
    pricingRegion,
    regionOptions,
    planViewModels,
    currentBillingTierKey,
    onRegionChange,
    onSelectCycle,
    onPrepareSubscription,
}) {
    return (
        <Card
            shadow='none'
            className='border-1 border-default-200 bg-white'
        >
            <CardBody className='space-y-3 p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div className='min-w-0'>
                        <p className='text-sm font-semibold text-default-800'>{title}</p>
                        {subtitle ? <p className='mt-1 text-xs text-default-500'>{subtitle}</p> : null}
                    </div>
                    <div className='flex shrink-0 items-center'>
                        <div className='inline-flex rounded-md border border-default-200 bg-default-50 p-0.5'>
                            {regionOptions.map((regionOption) => {
                                const active = pricingRegion === regionOption.key;
                                return (
                                    <button
                                        key={regionOption.key}
                                        type='button'
                                        className={`rounded-[6px] px-3 py-1 text-xs font-medium transition ${
                                            active
                                                ? 'bg-white text-default-900 shadow-sm'
                                                : 'text-default-500 hover:text-default-800'
                                        }`}
                                        onClick={() => onRegionChange(regionOption.key)}
                                    >
                                        {regionOption.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {planViewModels.length > 0 ? (
                    <div className='grid items-stretch gap-3 xl:grid-cols-3'>
                        {planViewModels.map((viewModel) => (
                            <SubscriptionPlanCard
                                key={viewModel.key}
                                viewModel={viewModel}
                                isCurrentPlan={currentBillingTierKey === viewModel.tier}
                                onSelectCycle={onSelectCycle}
                                onPrepareSubscription={onPrepareSubscription}
                            />
                        ))}
                    </div>
                ) : loading ? (
                    <div className='grid items-stretch gap-3 xl:grid-cols-3'>
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div
                                key={index}
                                className='relative flex h-full min-h-[272px] overflow-hidden rounded-2xl border border-default-200 bg-white p-4'
                            >
                                <div className='w-full'>
                                    <div className='flex items-center gap-2'>
                                        <Skeleton className='h-7 w-16 rounded-full' />
                                        {index === 1 ? <Skeleton className='h-6 w-16 rounded-full' /> : null}
                                    </div>
                                    <div className='mt-3'>
                                        <Skeleton className='h-8 w-24 rounded-lg' />
                                        <Skeleton className='mt-2 h-4 w-4/5 rounded-lg' />
                                        <Skeleton className='mt-2 h-3 w-2/5 rounded-lg' />
                                    </div>
                                    <div className='mt-2 rounded-xl border border-default-200 bg-default-50/70 px-3 py-3'>
                                        <Skeleton className='h-3 w-16 rounded-lg' />
                                        <Skeleton className='mt-2 h-7 w-20 rounded-lg' />
                                    </div>
                                    <Skeleton className='mt-4 h-4 w-4/5 rounded-lg' />
                                    <Skeleton className='mt-4 h-10 w-full rounded-xl' />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className='text-xs text-default-500'>{emptyText}</p>
                )}
            </CardBody>
        </Card>
    );
});

export default function Account() {
    const { t } = useTranslation();
    const [userInfo, setUserInfo] = useState(() => getCurrentUser().user || null);
    const [paymentConfig, setPaymentConfig] = useState(() => ACCOUNT_VIEW_CACHE.paymentConfig);
    const [billingProfile, setBillingProfile] = useState(() => {
        const initialUser = getCurrentUser().user || null;
        const cacheKey = String(initialUser?.id || '').trim();
        return cacheKey ? ACCOUNT_VIEW_CACHE.billingProfilesByUserId.get(cacheKey) || null : null;
    });
    const [billingCatalog, setBillingCatalog] = useState(
        () => ACCOUNT_VIEW_CACHE.billingCatalogsByKey.get(ACCOUNT_VIEW_CACHE.lastBillingCatalogKey) || null
    );
    const [billingProfileLoading, setBillingProfileLoading] = useState(() => {
        const initialUser = getCurrentUser().user || null;
        const cacheKey = String(initialUser?.id || '').trim();
        return Boolean(cacheKey) && !ACCOUNT_VIEW_CACHE.billingProfilesByUserId.has(cacheKey);
    });
    const [billingCatalogLoading, setBillingCatalogLoading] = useState(() => {
        const initialUser = getCurrentUser().user || null;
        const cachedCatalog =
            ACCOUNT_VIEW_CACHE.billingCatalogsByKey.get(ACCOUNT_VIEW_CACHE.lastBillingCatalogKey) || null;
        return Boolean(initialUser?.id) && !cachedCatalog;
    });
    const [selectedPlanCycles, setSelectedPlanCycles] = useState({});
    const [pricingRegion, setPricingRegion] = useState('global');
    const [rechargeAmount, setRechargeAmount] = useState('29');
    const [activePurchaseKey, setActivePurchaseKey] = useState('');
    const [cancelingOrder, setCancelingOrder] = useState(false);
    const [latestOrder, setLatestOrder] = useState(null);
    const [selectedPaymentProvider, setSelectedPaymentProvider] = useState(
        () => ACCOUNT_VIEW_CACHE.lastSelectedPaymentProvider || ''
    );
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

    const pollingInFlightRef = useRef(false);
    const successNoticeRef = useRef(new Set());
    const terminalNoticeRef = useRef(new Set());
    const adminUserPrefilledRef = useRef(false);
    const lastTriggeredRefreshAtRef = useRef(0);
    const prepareRechargeOrderRef = useRef(() => {});
    const prepareSubscriptionRef = useRef(() => {});
    const copyInviteLinkRef = useRef(() => {});
    const subscriptionPlans = useMemo(
        () => sortSubscriptionPlans(billingCatalog?.subscriptionPlans || []),
        [billingCatalog?.subscriptionPlans]
    );
    const resolvedCatalogPaymentProvider = getCatalogProviderForRegion(
        getProviderOptions(paymentConfig),
        pricingRegion,
        selectedPaymentProvider
    );
    const billingCatalogCacheKey = getBillingCatalogCacheKey(
        pricingRegion,
        resolvedCatalogPaymentProvider
    );

    function refreshUser() {
        const { user } = getCurrentUser();
        updateStateIfChanged(setUserInfo, user || null);
        return user;
    }

    function updateSelectedPaymentProvider(nextValue) {
        const normalizedValue = String(nextValue || '').trim();
        ACCOUNT_VIEW_CACHE.lastSelectedPaymentProvider = normalizedValue;
        setSelectedPaymentProvider((currentValue) =>
            currentValue === normalizedValue ? currentValue : normalizedValue
        );
    }

    async function triggerAccountRefresh({
        includeUser = true,
        includePaymentConfig = false,
        includeProfile = true,
        includeCatalog = false,
        dedupeMs = 0,
    } = {}) {
        const now = Date.now();
        if (dedupeMs > 0 && now - lastTriggeredRefreshAtRef.current < dedupeMs) {
            return;
        }
        lastTriggeredRefreshAtRef.current = now;

        const currentUser = includeUser ? refreshUser() : userInfo;
        const resolvedUserId = currentUser?.id || userInfo?.id;
        const tasks = [];

        if (includePaymentConfig) {
            tasks.push(loadPaymentConfig({ silent: true }));
        }
        if (includeProfile && resolvedUserId) {
            tasks.push(loadBillingProfile(resolvedUserId, { silent: true }));
        }
        if (includeCatalog && resolvedUserId) {
            tasks.push(
                loadBillingCatalog({
                    silent: true,
                    paymentProvider: resolvedCatalogPaymentProvider,
                    cacheKey: billingCatalogCacheKey,
                    force: true,
                })
            );
        }

        if (tasks.length > 0) {
            await Promise.allSettled(tasks);
        }
    }

    useEffect(() => {
        refreshUser();
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
            setBillingProfileLoading(false);
            setBillingCatalogLoading(false);
            setLatestOrder(null);
            updateSelectedPaymentProvider('');
            return;
        }
        if (ACCOUNT_VIEW_CACHE.paymentConfig) {
            updateStateIfChanged(setPaymentConfig, ACCOUNT_VIEW_CACHE.paymentConfig);
        } else {
            loadPaymentConfig({ silent: true });
        }
        const cachedProfile =
            ACCOUNT_VIEW_CACHE.billingProfilesByUserId.get(String(userInfo.id).trim()) || null;
        if (cachedProfile) {
            updateStateIfChanged(setBillingProfile, cachedProfile);
            setBillingProfileLoading(false);
        } else {
            setBillingProfileLoading(true);
        }
        loadBillingProfile(userInfo.id, { silent: true });
    }, [userInfo?.id]);

    useEffect(() => {
        if (userInfo?.id && !adminUserPrefilledRef.current) {
            setAdminUserId(String(userInfo.id));
            adminUserPrefilledRef.current = true;
        }
    }, [userInfo?.id]);

    useEffect(() => {
        const providerOptions = getProviderOptions(paymentConfig);
        const regionProviders = filterProvidersByRegion(providerOptions, pricingRegion);
        if (regionProviders.length === 0) {
            updateSelectedPaymentProvider('');
            return;
        }
        const availableValues = regionProviders.map((item) => String(item.name || '').trim());
        const nextDefault = getCatalogProviderForRegion(providerOptions, pricingRegion);
        if (!selectedPaymentProvider || !availableValues.includes(selectedPaymentProvider)) {
            updateSelectedPaymentProvider(nextDefault);
        }
    }, [paymentConfig, pricingRegion, selectedPaymentProvider]);

    useEffect(() => {
        if (!userInfo?.id) return;
        const cachedCatalog =
            ACCOUNT_VIEW_CACHE.billingCatalogsByKey.get(billingCatalogCacheKey) || null;
        if (cachedCatalog) {
            updateStateIfChanged(setBillingCatalog, cachedCatalog);
            setBillingCatalogLoading(false);
            return;
        }
        setBillingCatalogLoading(true);
        loadBillingCatalog({
            silent: true,
            paymentProvider: resolvedCatalogPaymentProvider,
            cacheKey: billingCatalogCacheKey,
        });
    }, [billingCatalogCacheKey, paymentConfig, resolvedCatalogPaymentProvider, userInfo?.id]);

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
        if (!userInfo?.id) return undefined;

        function handleWindowFocus() {
            triggerAccountRefresh({ dedupeMs: 1200 });
        }

        function handleVisibilityChange() {
            if (document.visibilityState === 'visible') {
                triggerAccountRefresh({ dedupeMs: 1200 });
            }
        }

        window.addEventListener('focus', handleWindowFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('focus', handleWindowFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [paymentConfig, pricingRegion, selectedPaymentProvider, userInfo?.id]);

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
                // keep polling quietly while the order is still in progress
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
            triggerAccountRefresh({
                includeUser: false,
                includePaymentConfig: false,
                includeProfile: true,
                includeCatalog: false,
            });
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
            triggerAccountRefresh({
                includeUser: false,
                includePaymentConfig: false,
                includeProfile: true,
                includeCatalog: false,
            });
            toast(t('config.account.payment_status_refunded_notice'));
        }
    }, [latestOrder?.id, latestOrder?.status, t, userInfo?.id]);

    async function loadPaymentConfig({ silent = false, force = false } = {}) {
        if (!force && ACCOUNT_VIEW_CACHE.paymentConfig) {
            updateStateIfChanged(setPaymentConfig, ACCOUNT_VIEW_CACHE.paymentConfig);
            return ACCOUNT_VIEW_CACHE.paymentConfig;
        }
        try {
            const data = await getPaymentGatewayConfig();
            ACCOUNT_VIEW_CACHE.paymentConfig = data || null;
            updateStateIfChanged(setPaymentConfig, ACCOUNT_VIEW_CACHE.paymentConfig);
            return ACCOUNT_VIEW_CACHE.paymentConfig;
        } catch (error) {
            if (!silent) {
                toast.error(error.message || t('config.account.payment_load_failed'));
            }
            return null;
        }
    }

    async function loadBillingProfile(
        userId = userInfo?.id,
        { silent = false, force = true } = {}
    ) {
        if (!userId) {
            setBillingProfileLoading(false);
            return null;
        }
        setBillingProfileLoading(true);
        const profileCacheKey = String(userId).trim();
        if (!force && profileCacheKey) {
            const cachedProfile = ACCOUNT_VIEW_CACHE.billingProfilesByUserId.get(profileCacheKey) || null;
            if (cachedProfile) {
                updateStateIfChanged(setBillingProfile, cachedProfile);
                setBillingProfileLoading(false);
                return cachedProfile;
            }
        }
        try {
            const data = await getBillingProfile(userId);
            const nextProfile = data?.profile || null;
            if (profileCacheKey) {
                ACCOUNT_VIEW_CACHE.billingProfilesByUserId.set(profileCacheKey, nextProfile);
            }
            updateStateIfChanged(setBillingProfile, nextProfile);
            return nextProfile;
        } catch (error) {
            if (!silent) {
                toast.error(error.message || t('config.account.billing_load_failed'));
            }
            return null;
        } finally {
            setBillingProfileLoading(false);
        }
    }

    async function loadBillingCatalog({
        silent = false,
        paymentProvider,
        cacheKey,
        force = false,
    } = {}) {
        if (!userInfo?.id) {
            setBillingCatalogLoading(false);
            return null;
        }
        setBillingCatalogLoading(true);
        try {
            const resolvedPaymentProvider =
                paymentProvider ??
                getCatalogProviderForRegion(
                    getProviderOptions(paymentConfig),
                    pricingRegion,
                    selectedPaymentProvider
                );
            const resolvedCacheKey =
                cacheKey || getBillingCatalogCacheKey(pricingRegion, resolvedPaymentProvider);
            if (!force) {
                const cachedCatalog =
                    ACCOUNT_VIEW_CACHE.billingCatalogsByKey.get(resolvedCacheKey) || null;
                if (cachedCatalog) {
                    updateStateIfChanged(setBillingCatalog, cachedCatalog);
                    setBillingCatalogLoading(false);
                    return cachedCatalog;
                }
            }
            const data = await getBillingCatalog({ paymentProvider: resolvedPaymentProvider });
            const nextCatalog = data?.catalog || null;
            ACCOUNT_VIEW_CACHE.billingCatalogsByKey.set(resolvedCacheKey, nextCatalog);
            ACCOUNT_VIEW_CACHE.lastBillingCatalogKey = resolvedCacheKey;
            updateStateIfChanged(setBillingCatalog, nextCatalog);
            return nextCatalog;
        } catch (error) {
            if (!silent) {
                toast.error(error.message || t('config.account.billing_catalog_load_failed'));
            }
            return null;
        } finally {
            setBillingCatalogLoading(false);
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
        updateSelectedPaymentProvider('');
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

    async function handleCopyInviteLink() {
        if (!inviteLink) {
            toast.error(t('config.account.invite_share_failed'));
            return;
        }

        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(inviteLink);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = inviteLink;
                textArea.setAttribute('readonly', 'readonly');
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            toast.success(t('config.account.invite_share_copied'));
        } catch {
            toast.error(t('config.account.invite_share_failed'));
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
            triggerAccountRefresh({
                includeUser: false,
                includePaymentConfig: false,
                includeProfile: true,
                includeCatalog: false,
            });
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

    function updateRechargeAmount(nextValue) {
        setRechargeAmount(nextValue);
        setPaymentIntent((current) =>
            current?.type === 'topup'
                ? {
                      ...current,
                      amount: nextValue,
                  }
                : current
        );
    }

    function handlePrepareRechargeOrder() {
        openPaymentModal({
            type: 'topup',
            amount: rechargeAmount,
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
            currency: billingCatalog?.currency || 'USD',
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

    prepareRechargeOrderRef.current = handlePrepareRechargeOrder;
    prepareSubscriptionRef.current = handlePrepareSubscription;
    copyInviteLinkRef.current = handleCopyInviteLink;

    const handlePrepareRechargeOrderStable = useCallback(() => {
        prepareRechargeOrderRef.current();
    }, []);

    const handlePrepareSubscriptionStable = useCallback((plan) => {
        prepareSubscriptionRef.current(plan);
    }, []);

    const handleCopyInviteLinkStable = useCallback(() => {
        void copyInviteLinkRef.current();
    }, []);

    const handleSelectPlanCycle = useCallback((tierKey, cycle) => {
        setSelectedPlanCycles((current) =>
            current[tierKey] === cycle
                ? current
                : {
                      ...current,
                      [tierKey]: cycle,
                  }
        );
    }, []);

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
            await handlePurchaseSubscription(paymentIntentResolvedPlan || paymentIntent.plan);
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
        const normalizedTarget = String(targetUserId || '')
            .trim()
            .toLowerCase();
        const currentUserId = String(userInfo.id || '')
            .trim()
            .toLowerCase();
        const currentUserEmail = String(userInfo.email || '')
            .trim()
            .toLowerCase();
        if (normalizedTarget !== currentUserId && normalizedTarget !== currentUserEmail) return;
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

    function formatBillingDate(value) {
        if (!value) return t('config.account.billing_none');
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString();
    }

    function formatBillingTime(value) {
        if (!value) return t('config.account.billing_none');
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'UTC',
        });
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
    const regionPaymentProviderOptions = filterProvidersByRegion(paymentProviderOptions, pricingRegion);
    const selectedProviderDetail =
        regionPaymentProviderOptions.find((item) => item.name === selectedPaymentProvider) ||
        paymentProviderOptions.find((item) => item.name === selectedPaymentProvider) ||
        null;
    const selectedProviderPurchaseReady = isProviderReadyForPurchase(selectedProviderDetail);
    const selectedProviderMissingFields =
        selectedProviderDetail?.createMissingFields || selectedProviderDetail?.missingFields || [];
    const paymentChannel =
        selectedPaymentProvider ||
        paymentConfig?.providers?.customOrchestrator?.channel ||
        paymentConfig?.providers?.customOrchestrator?.adapter ||
        '-';
    const paymentReady =
        selectedProviderDetail?.createReady ??
        selectedProviderDetail?.ready ??
        paymentConfig?.providers?.customOrchestrator?.ready;
    const paymentMissingFields =
        selectedProviderDetail?.createMissingFields ||
        selectedProviderDetail?.missingFields ||
        paymentConfig?.providers?.customOrchestrator?.missingFields ||
        [];
    const hasReadyPaymentProvider = regionPaymentProviderOptions.some((item) =>
        isProviderReadyForPurchase(item)
    );
    const topupCreditsPerUnit = Number(
        billingCatalog?.topupCreditsPerUnit ?? billingCatalog?.topupCreditsPerCny
    );
    const latestOrderQrPayload = getOrderQrPayload(latestOrder);
    const topupPresets = billingCatalog?.topupPresets || [];
    const activeAdminToken = String(adminTokenInput || '').trim();
    const hasSavedAdminToken = Boolean(savedAdminToken);
    const adminTokenDirty = activeAdminToken !== savedAdminToken;
    const adminRefundMeta = adminManagedOrder?.metadata?.refund || null;
    const currentBillingTierKey = tierConfig?.key || 'free';
    const paymentIntentType = paymentIntent?.type || '';
    const paymentIntentTopupAmount =
        paymentIntentType === 'topup' ? Number(paymentIntent?.amount) || 0 : 0;
    const paymentIntentEstimatedCredits =
        Number.isFinite(topupCreditsPerUnit) && Number.isFinite(paymentIntentTopupAmount)
            ? Math.max(0, Math.floor(paymentIntentTopupAmount * topupCreditsPerUnit))
            : null;
    const paymentIntentResolvedPlan =
        paymentIntentType === 'subscription'
            ? subscriptionPlans.find(
                  (plan) =>
                      String(plan?.productCode || '').trim() ===
                      String(paymentIntent?.plan?.productCode || '').trim()
              ) ||
              (paymentIntent?.plan || null)
            : null;
    const paymentIntentOrderType =
        paymentIntentType === 'subscription'
            ? 'subscription'
            : paymentIntentType === 'topup'
              ? 'topup'
              : '';
    const paymentIntentProductCode =
        paymentIntentType === 'subscription'
            ? String(paymentIntentResolvedPlan?.productCode || '').trim()
            : paymentIntentType === 'topup'
              ? 'membership_topup'
              : '';
    const paymentIntentTitle =
        paymentIntentType === 'subscription' && paymentIntentResolvedPlan
            ? `${t(`config.account.tier_${paymentIntentResolvedPlan.tier}`)} ${t(
                  `config.account.subscription_cycle_${paymentIntentResolvedPlan.billingCycle}`
              )}`
            : t('config.account.order_type_topup');
    const paymentIntentAmountLabel =
        paymentIntentType === 'subscription' && paymentIntentResolvedPlan
            ? formatMoney(paymentIntentResolvedPlan.amount, paymentIntentResolvedPlan.currency)
            : formatMoney(paymentIntentTopupAmount, billingCatalog?.currency || 'CNY');
    const paymentIntentHasValidAmount =
        paymentIntentType !== 'topup' ||
        (Number.isFinite(paymentIntentTopupAmount) && paymentIntentTopupAmount > 0);
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
    const billingExpiryDisplay = formatBillingDate(billingProfile?.subscriptionExpiresAt);
    const quotaResetDeadline = resolveQuotaResetDeadline(billingProfile?.quotaResetAt);
    const quotaResetTimeDisplay = quotaResetDeadline
        ? `${formatBillingTime(quotaResetDeadline)} UTC`
        : t('config.account.billing_none');
    const billingStatusNormalized = String(billingProfile?.status || '')
        .trim()
        .toLowerCase();
    const billingStatusLabel = billingProfile?.status
        ? getBillingStatusLabel(billingProfile.status)
        : null;
    const billingStatusColor = billingProfile?.status
        ? getBillingStatusColor(billingProfile.status)
        : 'default';
    const showBillingStatusBadge =
        Boolean(billingStatusLabel) && billingStatusNormalized !== 'active';
    const showBillingExpiryMeta =
        !showBillingStatusBadge &&
        billingExpiryDisplay &&
        billingExpiryDisplay !== t('config.account.billing_none');
    const inviteCode = getInviteCode(billingProfile, userInfo);
    const inviteLink = buildInviteLink(inviteCode);
    const inviteStats = resolveInviteStats(billingProfile, userInfo);
    const comparisonFreePlan = useMemo(
        () => ({
            productCode: 'membership_free',
            tier: 'free',
            billingCycle: 'month',
            durationDays: 30,
            amount: 0,
            currency: billingCatalog?.currency || 'CNY',
            dailyQuota: billingCatalog?.freeTier?.dailyQuota ?? 20,
            allowCreditFallback: billingCatalog?.freeTier?.allowCreditFallback ?? true,
            isIncludedPlan: true,
        }),
        [
            billingCatalog?.currency,
            billingCatalog?.freeTier?.allowCreditFallback,
            billingCatalog?.freeTier?.dailyQuota,
        ]
    );
    const subscriptionPlanCards = useMemo(
        () =>
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
                          tierPlans.find((plan) => plan?.billingCycle === selectedCycle) ||
                          tierPlans[0];

                      return {
                          tierKey,
                          plan: selectedPlan,
                          availableCycles: tierCycles,
                      };
                  }).filter(Boolean)
                : [],
        [comparisonFreePlan, selectedPlanCycles, subscriptionPlans]
    );
    const billingPanelViewModel = useMemo(
        () => ({
            title: t('config.account.billing_title'),
            subtitle: t('config.account.billing_summary_subtitle'),
            purchaseActionLabel: t('config.account.credit_purchase_action'),
            ready: Boolean(billingProfile),
            hasReadyPaymentProvider,
            dailyQuotaLabel: t('config.account.billing_daily_quota'),
            usageDisplay: billingUsageDisplay,
            showUnlimitedBadge: Number.isFinite(billingQuotaValue) && billingQuotaValue < 0,
            unlimitedLabel: t('config.account.billing_unlimited'),
            creditsLabel: t('config.account.billing_credits'),
            creditsDisplay: billingCreditsDisplay,
            subscriptionExpiresLabel: t('config.account.billing_subscription_expires'),
            expiryDisplay: billingExpiryDisplay,
            quotaResetLabel: t('config.account.billing_quota_reset_at'),
            quotaResetDisplay: quotaResetTimeDisplay,
            inviteCodeLabel: t('config.account.invite_code'),
            inviteCodeDisplay: inviteCode || t('config.account.billing_none'),
            inviteShareLabel: t('config.account.invite_share'),
            inviteShareDisabled: !inviteLink,
            invitedCountLabel: t('config.account.invite_invited_count'),
            invitedCount: inviteStats.invitedCount,
            pendingCountLabel: t('config.account.invite_pending_count'),
            pendingCount: inviteStats.pendingCount,
            rewardedCreditsLabel: t('config.account.invite_rewarded_credits'),
            rewardedCredits: inviteStats.rewardedCredits,
            notReadyText: t('config.account.billing_not_ready'),
        }),
        [
            billingCreditsDisplay,
            billingExpiryDisplay,
            billingProfile,
            billingQuotaValue,
            billingUsageDisplay,
            hasReadyPaymentProvider,
            inviteCode,
            inviteLink,
            inviteStats.invitedCount,
            inviteStats.pendingCount,
            inviteStats.rewardedCredits,
            quotaResetTimeDisplay,
            t,
        ]
    );
    const billingRegionOptions = useMemo(
        () =>
            BILLING_REGION_ORDER.map((regionKey) => ({
                key: regionKey,
                label: t(`config.account.${BILLING_REGION_CONFIG[regionKey].labelKey}`),
            })),
        [t]
    );
    const subscriptionPlanViewModels = useMemo(
        () =>
            subscriptionPlanCards.map(({ plan, availableCycles }) => {
                const planTierConfig = TIER_KEYS[plan.tier] ?? TIER_KEYS.free;
                const planCardStyle = PLAN_CARD_STYLES[plan.tier] || PLAN_CARD_STYLES.basic;
                const isFreePlan = plan.tier === 'free' || plan.isIncludedPlan;
                const isRecommendedPlan = plan.tier === 'pro';
                const yearlySavings = getPlanYearlySavings(plan, subscriptionPlans);
                const monthlyAverage =
                    !isFreePlan && plan.billingCycle === 'year'
                        ? formatMoney(Number(plan.amount || 0) / 12, plan.currency)
                        : null;
                const durationLabel = isFreePlan
                    ? t('config.account.subscription_free_feature')
                    : t('config.account.subscription_duration_value', {
                          value: plan.durationDays,
                      });
                const fallbackLabel = plan.allowCreditFallback
                    ? t('config.account.subscription_credit_fallback')
                    : '';

                return {
                    key: `${plan.tier}_${plan.billingCycle}`,
                    tier: plan.tier,
                    plan,
                    billingCycle: plan.billingCycle,
                    availableCycles: availableCycles.map((cycle) => ({
                        value: cycle,
                        label: t(`config.account.subscription_cycle_${cycle}`),
                    })),
                    borderClass: planCardStyle.border,
                    surfaceClass: planCardStyle.surface,
                    accentClass: planCardStyle.accent,
                    badgeClass: planCardStyle.badge,
                    tierLabel: t(`config.account.tier_${planTierConfig.key}`),
                    isRecommended: isRecommendedPlan,
                    recommendedLabel: t('config.account.subscription_recommended'),
                    currentPlanLabel: t('config.account.subscription_current_plan'),
                    priceLabel: isFreePlan
                        ? t('config.account.subscription_price_free')
                        : formatMoney(plan.amount, plan.currency),
                    priceUnitLabel: isFreePlan
                        ? ''
                        : `/${t(`config.account.subscription_unit_${plan.billingCycle}`)}`,
                    description: t(`config.account.subscription_tier_${plan.tier}_desc`),
                    monthlyAverageLabel: monthlyAverage
                        ? t('config.account.subscription_monthly_average', {
                              value: monthlyAverage,
                          })
                        : '',
                    yearlySavingsLabel: yearlySavings
                        ? t('config.account.subscription_yearly_savings', {
                              value: yearlySavings,
                          })
                        : '',
                    dailyQuotaLabel: t('config.account.billing_daily_quota'),
                    dailyQuotaValue: formatBillingQuota(plan.dailyQuota),
                    primaryFeatureLabel:
                        durationLabel && fallbackLabel
                            ? `${durationLabel} · ${fallbackLabel}`
                            : durationLabel || fallbackLabel,
                    isFreePlan,
                    ctaLabel: isFreePlan
                        ? t('config.account.subscription_free_action')
                        : t('config.account.subscription_buy'),
                    ctaToneClass:
                        PLAN_CTA_TONE_STYLES[
                            isFreePlan ? 'neutral' : 'primary'
                        ] || PLAN_CTA_TONE_STYLES.primary,
                    ctaDisabled: isFreePlan || !hasReadyPaymentProvider,
                };
            }),
        [hasReadyPaymentProvider, subscriptionPlanCards, subscriptionPlans, t]
    );

    return (
        <div className='space-y-4 p-1'>
            <Toaster
                position='top-center'
                toastOptions={{ duration: 2500, style: { fontSize: '13px', borderRadius: '10px' } }}
            />

            {userInfo && (
                <div className='grid gap-3 xl:grid-cols-[minmax(248px,0.72fr)_minmax(0,1.28fr)]'>
                    <Card
                        shadow='none'
                        className='self-start border-1 border-default-200 bg-white'
                    >
                        <CardBody className='flex flex-col gap-4 p-4'>
                            <div className='flex items-start justify-between gap-3'>
                                <div className='flex min-w-0 items-center gap-3'>
                                    <Avatar
                                        name={userInfo.display_name?.charAt(0)?.toUpperCase() ?? 'U'}
                                        size='md'
                                        classNames={{
                                            base: 'border border-default-200 bg-default-100',
                                            name: 'font-semibold text-default-700',
                                        }}
                                    />
                                    <div className='min-w-0'>
                                        <div className='flex flex-wrap items-center gap-2'>
                                            <p className='truncate text-sm font-semibold text-default-800'>
                                                {userInfo.display_name}
                                            </p>
                                            <Chip
                                                size='sm'
                                                color={tierConfig.color}
                                                variant='flat'
                                                className='text-[10px]'
                                            >
                                                {t(`config.account.tier_${tierConfig.key}`)}
                                            </Chip>
                                            {showBillingStatusBadge ? (
                                                <Chip
                                                    size='sm'
                                                    color={billingStatusColor}
                                                    variant='flat'
                                                    className='text-[10px]'
                                                >
                                                    {billingStatusLabel}
                                                </Chip>
                                            ) : null}
                                            {showBillingExpiryMeta ? (
                                                <span className='text-[11px] font-medium text-default-500'>
                                                    {t('config.account.billing_subscription_expires')}{' '}
                                                    {billingExpiryDisplay}
                                                </span>
                                            ) : null}
                                        </div>
                                        <p className='mt-1 truncate text-xs text-default-500'>
                                            {userInfo.email}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    size='sm'
                                    variant='light'
                                    color='danger'
                                    className='shrink-0'
                                    startContent={<MdLogout className='text-base' />}
                                    title={t('config.account.logout')}
                                    onPress={handleLogout}
                                >
                                    {t('config.account.logout')}
                                </Button>
                            </div>
                        </CardBody>
                    </Card>

                    <AccountBillingPanel
                        viewModel={billingPanelViewModel}
                        loading={billingProfileLoading}
                        onPrepareRechargeOrder={handlePrepareRechargeOrderStable}
                        onCopyInviteLink={handleCopyInviteLinkStable}
                    />
                </div>
            )}

            {userInfo && (
                <AccountSubscriptionPlansPanel
                    title={t('config.account.subscription_title')}
                    subtitle=''
                    emptyText={t('config.account.subscription_not_ready')}
                    loading={billingCatalogLoading}
                    pricingRegion={pricingRegion}
                    regionOptions={billingRegionOptions}
                    planViewModels={subscriptionPlanViewModels}
                    currentBillingTierKey={currentBillingTierKey}
                    onRegionChange={setPricingRegion}
                    onSelectCycle={handleSelectPlanCycle}
                    onPrepareSubscription={handlePrepareSubscriptionStable}
                />
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

                        {paymentIntentType === 'topup' && (
                            <div className='rounded-[24px] border border-default-200 p-4'>
                                <div className='space-y-1'>
                                    <p className='text-sm font-semibold text-default-800'>
                                        {t('config.account.credit_topup_title')}
                                    </p>
                                    <p className='text-xs text-default-500'>
                                        {t('config.account.credit_topup_subtitle')}
                                    </p>
                                </div>

                                {topupPresets.length > 0 && (
                                    <div className='mt-4 space-y-2'>
                                        <p className='text-xs font-medium text-default-600'>
                                            {t('config.account.topup_presets_title')}
                                        </p>
                                        <div className='flex flex-wrap gap-2'>
                                            {topupPresets.map((preset) => (
                                                <Button
                                                    key={`${preset.productCode}_${preset.amount}`}
                                                    size='sm'
                                                    variant={
                                                        Number(paymentIntent?.amount) === Number(preset.amount)
                                                            ? 'solid'
                                                            : 'bordered'
                                                    }
                                                    color='primary'
                                                    className='min-h-[40px]'
                                                    onPress={() =>
                                                        updateRechargeAmount(String(preset.amount))
                                                    }
                                                >
                                                    {formatMoney(preset.amount, preset.currency)}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className='mt-4 flex flex-wrap items-end gap-2'>
                                    <Input
                                        type='number'
                                        min={0.01}
                                        step={0.01}
                                        size='sm'
                                        label={t('config.account.credit_purchase_amount')}
                                        value={String(paymentIntent?.amount ?? rechargeAmount)}
                                        onValueChange={updateRechargeAmount}
                                        className='min-w-[220px] flex-1'
                                    />
                                </div>
                            </div>
                        )}

                        <div className='rounded-[24px] border border-default-200 p-4'>
                            <div className='mb-3 flex items-center gap-2'>
                                <p className='text-sm font-semibold text-default-800'>
                                    {t('config.account.payment_title')}
                                </p>
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

                        {regionPaymentProviderOptions.length > 0 && (
                            <div className='space-y-2'>
                                <label className='text-xs text-default-500'>
                                    {t('config.account.payment_provider_label')}
                                </label>
                                {regionPaymentProviderOptions.length > 1 ? (
                                    <select
                                        value={selectedPaymentProvider}
                                        onChange={(event) =>
                                            updateSelectedPaymentProvider(event.target.value)
                                        }
                                        className='w-full rounded-lg border border-default-200 bg-transparent px-3 py-2 text-sm text-default-700 outline-none'
                                    >
                                        {regionPaymentProviderOptions.map((item) => (
                                            <option
                                                key={item.name}
                                                value={item.name}
                                            >
                                                {getProviderDisplayName(item.name)}
                                                {!isProviderReadyForPurchase(item)
                                                    ? ` (${t('config.account.payment_ready_no')})`
                                                    : ''}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className='rounded-lg border border-default-200 bg-default-50 px-3 py-2 text-sm text-default-700'>
                                        {getProviderDisplayName(regionPaymentProviderOptions[0]?.name)}
                                    </div>
                                )}
                                {selectedProviderMissingFields.length > 0 && (
                                    <p className='text-xs text-danger-500'>
                                        {t('config.account.payment_provider_missing')}:{' '}
                                        <span className='font-mono'>
                                            {selectedProviderMissingFields.join(', ')}
                                        </span>
                                    </p>
                                )}
                            </div>
                        )}

                        <Button
                            size='md'
                            color={
                                paymentIntentType === 'subscription' &&
                                paymentIntentResolvedPlan?.tier === 'pro'
                                    ? 'secondary'
                                    : 'primary'
                            }
                            isLoading={
                                paymentIntentType === 'subscription'
                                    ? activePurchaseKey === paymentIntentResolvedPlan?.productCode
                                    : activePurchaseKey === 'topup_custom'
                            }
                            isDisabled={
                                !paymentIntent ||
                                !paymentIntentHasValidAmount ||
                                !selectedProviderPurchaseReady
                            }
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
                                    {!isTerminalOrderStatus(paymentFlowOrder.status) && (
                                        <Button
                                            size='sm'
                                            variant='light'
                                            color='danger'
                                            isLoading={cancelingOrder}
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
