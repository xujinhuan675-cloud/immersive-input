import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentUser } from '../utils/auth';
import Login from '../window/Login';

/**
 * 认证守卫组件
 * 未登录时显示登录界面，登录后显示子组件
 */
export default function AuthGuard({ children, showWelcome = false }) {
    const { t } = useTranslation();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isChecking, setIsChecking] = useState(true);

    function checkAuth() {
        const { user, token } = getCurrentUser();
        setIsAuthenticated(!!(user && token));
        setIsChecking(false);
    }

    useEffect(() => {
        checkAuth();

        // 定期检查登录状态（每秒检查一次）
        const interval = setInterval(checkAuth, 1000);
        return () => clearInterval(interval);
    }, []);

    function handleLoginSuccess() {
        setIsAuthenticated(true);
    }

    // 检查中，显示空白或加载状态
    if (isChecking) {
        return (
            <div className='h-screen flex items-center justify-center bg-background'>
                <div className='text-default-500'>Loading...</div>
            </div>
        );
    }

    // 未登录，显示登录界面
    if (!isAuthenticated) {
        return (
            <div className='h-screen flex flex-col bg-background'>
                {showWelcome && (
                    <div className='flex-shrink-0 bg-gradient-to-r from-blue-500 to-purple-600 text-white py-6 px-6'>
                        <div className='flex items-center justify-center gap-3'>
                            <svg className='w-8 h-8' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' />
                            </svg>
                            <div>
                                <h2 className='text-xl font-bold'>{t('login.welcome_title')}</h2>
                                <p className='text-sm opacity-90 mt-0.5'>{t('login.welcome_subtitle')}</p>
                            </div>
                        </div>
                    </div>
                )}
                <div className='flex-1 overflow-auto'>
                    <Login
                        embedded={true}
                        onSuccess={handleLoginSuccess}
                    />
                </div>
            </div>
        );
    }

    // 已登录，显示子组件
    return <>{children}</>;
}
