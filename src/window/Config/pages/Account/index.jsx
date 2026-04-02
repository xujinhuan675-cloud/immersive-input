import React, { useState, useEffect } from 'react';
import { Button, Card, CardBody, Avatar, Chip } from '@nextui-org/react';
import { invoke } from '@tauri-apps/api/tauri';
import { MdLogin, MdLogout, MdAccountCircle } from 'react-icons/md';
import toast, { Toaster } from 'react-hot-toast';

import { getCurrentUser, logout } from '../../../../utils/auth';

// 会员等级显示配置（预留）
const TIER_MAP = {
    free: { label: '免费版', color: 'default' },
    basic: { label: '基础版', color: 'primary' },
    pro: { label: '专业版', color: 'secondary' },
    enterprise: { label: '企业版', color: 'warning' },
};

export default function Account() {
    const [userInfo, setUserInfo] = useState(null);

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

    async function handleOpenLogin() {
        try {
            await invoke('open_login_window');
        } catch (e) {
            console.error('[Account] open_login_window failed:', e);
            toast.error('打开登录窗口失败，请确认应用已重新编译');
        }
    }

    async function handleLogout() {
        await logout();
        setUserInfo(null);
        toast.success('已退出登录');
    }

    const tier = userInfo ? (TIER_MAP[userInfo.membership_tier] ?? TIER_MAP.free) : null;

    return (
        <div className='space-y-4 p-1'>
            <Toaster
                position='top-center'
                toastOptions={{ duration: 2500, style: { fontSize: '13px', borderRadius: '10px' } }}
            />
            {/* ── 未登录状态 ─────────────────────────────── */}
            {!userInfo && (
                <Card shadow='none' className='border-1 border-default-100'>
                    <CardBody className='flex flex-col items-center py-8 gap-4'>
                        <MdAccountCircle className='text-[64px] text-default-300' />
                        <div className='text-center'>
                            <p className='text-default-700 font-medium'>尚未登录</p>
                            <p className='text-xs text-default-400 mt-1'>
                            登录后可解锁更多 AI 功能
                            </p>
                        </div>
                        <Button
                            className='bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white font-medium px-8'
                            radius='lg'
                            startContent={<MdLogin className='text-lg' />}
                            onPress={handleOpenLogin}
                        >
                            登录 / 注册账号
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
                                base: 'bg-gradient-to-br from-[#7C3AED] to-[#A855F7]',
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
                                    color={tier.color}
                                    variant='flat'
                                    className='text-xs'
                                >
                                    {tier.label}
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
                            title='退出登录'
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
