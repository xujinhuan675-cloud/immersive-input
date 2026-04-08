import React, { useState, useEffect } from 'react';
import { open as openExternal } from '@tauri-apps/api/shell';
import { Button, Card, CardBody, Avatar, Chip, Input } from '@nextui-org/react';
import { MdLogout } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import toast, { Toaster } from 'react-hot-toast';

import { getCurrentUser, logout } from '../../../../utils/auth';
import {
    createPaymentOrder,
    getPaymentGatewayConfig,
    getPaymentOrderStatus,
} from '../../../../utils/payment';

// 会员等级配置（预留）
const TIER_KEYS = {
    free: { key: 'free', color: 'default' },
    basic: { key: 'basic', color: 'primary' },
    pro: { key: 'pro', color: 'secondary' },
    enterprise: { key: 'enterprise', color: 'warning' },
};

export default function Account() {
    const { t } = useTranslation();
    const [userInfo, setUserInfo] = useState(null);
    const [paymentConfig, setPaymentConfig] = useState(null);
    const [rechargeAmount, setRechargeAmount] = useState('29');
    const [creatingOrder, setCreatingOrder] = useState(false);
    const [refreshingOrder, setRefreshingOrder] = useState(false);
    const [latestOrder, setLatestOrder] = useState(null);

    // 读取本地登录状态
    function refreshUser() {
        const { user } = getCurrentUser();
        setUserInfo(user);
    }

    useEffect(() => {
        refreshUser();

        // 定期刷新用户信息
        const timer = setInterval(refreshUser, 1500);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        loadPaymentConfig();
    }, []);

    async function loadPaymentConfig() {
        try {
            const data = await getPaymentGatewayConfig();
            setPaymentConfig(data);
        } catch (e) {
            toast.error(e.message || t('config.account.payment_load_failed'));
        }
    }

    async function handleLogout() {
        await logout();
        setUserInfo(null);
        toast.success(t('config.account.logout_success'));
        // 退出登录后，AuthGuard 会自动检测到并显示登录界面
    }
    async function openCheckout(url) {
        if (!url) return;
        try {
            await openExternal(url);
        } catch {
            window.open(url, '_blank');
        }
    }

    async function handleCreateRechargeOrder() {
        if (!userInfo?.id) {
            toast.error(t('config.account.not_logged_in'));
            return;
        }
        const amount = Number(rechargeAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            toast.error(t('config.account.payment_invalid_amount'));
            return;
        }

        setCreatingOrder(true);
        try {
            const idempotencyKey = `${userInfo.id}_${Date.now()}`;
            const result = await createPaymentOrder({
                amount,
                currency: 'CNY',
                orderType: 'topup',
                productCode: 'membership_topup',
                description: `Membership recharge for ${userInfo.email || userInfo.id}`,
                metadata: {
                    userEmail: userInfo.email || '',
                },
                idempotencyKey,
            });
            setLatestOrder(result.order || null);
            toast.success(t('config.account.payment_create_success'));
            if (result?.order?.checkoutUrl) {
                await openCheckout(result.order.checkoutUrl);
            } else {
                toast(t('config.account.payment_checkout_unavailable'));
            }
        } catch (e) {
            toast.error(e.message || t('config.account.payment_create_failed'));
        } finally {
            setCreatingOrder(false);
        }
    }

    async function handleRefreshOrderStatus() {
        if (!latestOrder?.id) return;
        setRefreshingOrder(true);
        try {
            const result = await getPaymentOrderStatus(latestOrder.id);
            setLatestOrder(result.order || latestOrder);
            toast.success(t('config.account.payment_refresh_success'));
        } catch (e) {
            toast.error(e.message || t('config.account.payment_refresh_failed'));
        } finally {
            setRefreshingOrder(false);
        }
    }

    function getStatusColor(status) {
        const s = String(status || '').toUpperCase();
        if (s === 'PAID' || s === 'COMPLETED') return 'success';
        if (s === 'FAILED' || s === 'CANCELED') return 'danger';
        if (s === 'REFUNDED') return 'warning';
        return 'primary';
    }

    function formatOrderAmount(order) {
        if (!order) return '-';
        const amount = Number(order.amountCents || 0) / 100;
        return `${amount.toFixed(2)} ${order.currency || 'CNY'}`;
    }

    const tierConfig = userInfo ? (TIER_KEYS[userInfo.membership_tier] ?? TIER_KEYS.free) : null;
    const activeBackend = paymentConfig?.activeBackend || '-';
    const customEnabled = paymentConfig?.customOrchestratorEnabled ? 'ON' : 'OFF';

    return (
        <div className='space-y-4 p-1'>
            <Toaster
                position='top-center'
                toastOptions={{ duration: 2500, style: { fontSize: '13px', borderRadius: '10px' } }}
            />

            {/* ── 已登录：用户信息卡片 ────────────────────── */}
            {userInfo && (
                <Card shadow='none' className='border-1 border-default-100'>
                    <CardBody className='flex flex-row items-center gap-4 py-4'>
                        <Avatar
                            name={userInfo.display_name?.charAt(0)?.toUpperCase() ?? 'U'}
                            size='lg'
                            classNames={{
                                base: 'bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6]',
                                name: 'text-white font-bold text-lg',
                            }}
                        />
                        <div className='flex-1 min-w-0'>
                            <div className='flex items-center gap-2'>
                                <p className='font-semibold text-default-800 truncate'>
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
                            </div>
                            <p className='text-xs text-default-400 mt-0.5 truncate'>
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
                    </CardBody>
                </Card>
            )}
            {/* ── 支付方案与充值入口 ────────────────────── */}
            {userInfo && (
                <Card shadow='none' className='border-1 border-default-100'>
                    <CardBody className='space-y-3'>
                        <div className='flex items-center justify-between gap-2'>
                            <p className='text-sm font-semibold text-default-800'>
                                {t('config.account.payment_title')}
                            </p>
                            <Button size='sm' variant='light' onPress={loadPaymentConfig}>
                                {t('config.account.payment_reload')}
                            </Button>
                        </div>

                        <div className='text-xs text-default-500 space-y-1'>
                            <p>
                                {t('config.account.payment_active_backend')}:
                                <span className='font-mono ml-1 text-default-700'>{activeBackend}</span>
                            </p>
                            <p>
                                {t('config.account.payment_custom_enabled')}:
                                <span className='font-mono ml-1 text-default-700'>{customEnabled}</span>
                            </p>
                        </div>

                        <div className='flex items-end gap-2'>
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
                                isLoading={creatingOrder}
                                onPress={handleCreateRechargeOrder}
                            >
                                {t('config.account.payment_create')}
                            </Button>
                        </div>

                        {latestOrder && (
                            <div className='rounded-lg border border-default-200 p-3 space-y-2'>
                                <div className='flex items-center justify-between gap-2'>
                                    <p className='text-xs text-default-600'>
                                        {t('config.account.payment_latest_order')}:
                                        <span className='font-mono ml-1'>{latestOrder.id}</span>
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
                                <div className='flex gap-2'>
                                    <Button
                                        size='sm'
                                        variant='bordered'
                                        isDisabled={!latestOrder.checkoutUrl}
                                        onPress={() => openCheckout(latestOrder.checkoutUrl)}
                                    >
                                        {t('config.account.payment_open_checkout')}
                                    </Button>
                                    <Button
                                        size='sm'
                                        variant='light'
                                        isLoading={refreshingOrder}
                                        onPress={handleRefreshOrderStatus}
                                    >
                                        {t('config.account.payment_refresh')}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardBody>
                </Card>
            )}

        </div>
    );
}
