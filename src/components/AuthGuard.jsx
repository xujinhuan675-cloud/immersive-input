import React, { useState, useEffect } from 'react';
import { getCurrentUser } from '../utils/auth';
import WindowControl from './WindowControl';
import { osType } from '../utils/env';
import Login from '../window/Login';

/**
 * 认证守卫组件
 * 未登录时显示登录界面，登录后显示子组件
 */
export default function AuthGuard({ children, showWelcome = false }) {
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
                {/* 拖拽栏 + 窗口控制（只在非嵌入场景显示） */}
                {showWelcome && (
                    <div
                        data-tauri-drag-region='true'
                        className='h-[35px] flex items-center justify-between shrink-0 px-2'
                    >
                        <div data-tauri-drag-region='true' className='flex-1 h-full' />
                        {osType !== 'Darwin' && <WindowControl />}
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
