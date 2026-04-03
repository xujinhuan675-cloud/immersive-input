import React, { useState, useEffect } from 'react';
import { Button, Card, CardBody, Avatar, Chip } from '@nextui-org/react';
import { MdLogin, MdLogout, MdAccountCircle } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import toast, { Toaster } from 'react-hot-toast';

import { getCurrentUser, logout } from '../../../../utils/auth';
import Login from '../../../Login';

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
    const [showLogin, setShowLogin] = useState(false);

    // 读取本地登录状态
    function refreshUser() {
        const { user } = getCurrentUser();
        setUserInfo(user);
    }

    useEffect(() => {
        refreshUser();

        // 监听登录窗口关闭后的状态变化
        // 后续接入 Supabase 时可改为监听 auth-state-changed 事件
        const timer = setInterval(refreshUser, 1500);
        return () => clearInterval(timer);
    }, []);

    function handleOpenLogin() {
        setShowLogin(true);
    }

    async function handleLogout() {
        await logout();
        setUserInfo(null);
        toast.success(t('config.account.logout_success'));
    }

    const tierConfig = userInfo ? (TIER_KEYS[userInfo.membership_tier] ?? TIER_KEYS.free) : null;

    return (
        <div className='space-y-4 p-1'>
            <Toaster
                position='top-center'
                toastOptions={{ duration: 2500, style: { fontSize: '13px', borderRadius: '10px' } }}
            />
            {showLogin && !userInfo && (
                <Card shadow='none' className='border-1 border-default-100'>
                    <CardBody className='py-6'>
                        <Login
                            embedded
                            onSuccess={() => {
                                setShowLogin(false);
                                refreshUser();
                            }}
                        />
                    </CardBody>
                </Card>
            )}
            {/* ── 未登录状态 ─────────────────────────────── */}
            {!userInfo && !showLogin && (
                <Card shadow='none' className='border-1 border-default-100'>
                    <CardBody className='flex flex-col items-center py-8 gap-4'>
                        <MdAccountCircle className='text-[64px] text-default-300' />
                        <div className='text-center'>
                            <p className='text-default-700 font-medium'>{t('config.account.not_logged_in')}</p>
                            <p className='text-xs text-default-400 mt-1'>{t('config.account.login_desc')}</p>
                        </div>
                        <Button
                            className='bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white font-medium px-8'
                            radius='lg'
                            startContent={<MdLogin className='text-lg' />}
                            onPress={handleOpenLogin}
                        >
                            {t('config.account.login_btn')}
                        </Button>
                    </CardBody>
                </Card>
            )}

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

        </div>
    );
}
