import React, { useState, useEffect } from 'react';
import { appWindow } from '@tauri-apps/api/window';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';

import WindowControl from '../../components/WindowControl';
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';
import { osType } from '../../utils/env';

export default function Login() {
    const [tab, setTab] = useState('login'); // 'login' | 'register'

    useEffect(() => {
        if (appWindow.label === 'login') {
            appWindow.show();
        }
    }, []);

    function handleSuccess({ user }) {
        // 登录/注册成功后的处理
        // 后续可在这里 emit Tauri 事件通知其他窗口用户已登录
        // emit('auth-state-changed', { action: 'login', user });
        setTimeout(() => {
            appWindow.close();
        }, 1200);
    }

    return (
        <div
            className='h-screen overflow-y-auto flex flex-col bg-[#eef0f6] dark:bg-[#1a1a2e] select-none cursor-default'
            style={{ userSelect: 'none' }}
        >
            {/* 标题栏（拖拽区 + 窗口控制按钮）*/}
            <div
                data-tauri-drag-region='true'
                className='h-[35px] flex items-center justify-between shrink-0 px-2'
            >
                {/* 左侧拖拽区域 */}
                <div
                    data-tauri-drag-region='true'
                    className='flex-1 h-full'
                />
                {/* 右侧窗口控制 */}
                {osType !== 'Darwin' && <WindowControl />}
            </div>

            {/* 中央卡片 */}
            <div className='flex-1 flex items-center justify-center px-6 py-2'>
                <div
                    className='w-full max-w-[430px] bg-white dark:bg-[#1e1e2e] rounded-2xl shadow-xl px-8 pt-7 pb-8'
                >
                    {/* 品牌区 */}
                    <div className='flex flex-col items-center mb-6'>
                        <img
                            src='icon.svg'
                            alt='Logo'
                            className='h-[60px] w-[60px] mb-3'
                            draggable={false}
                        />
                        <h1 className='text-xl font-bold text-default-800 tracking-wide'>
                            无忧小助手
                        </h1>
                        <p className='text-xs text-default-400 mt-1 tracking-widest'>
                            NIRVANA · 欢迎回来
                        </p>
                    </div>

                    {/* Tab 切换 */}
                    <div className='flex bg-default-100 rounded-xl p-1 mb-5'>
                        <button
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                tab === 'login'
                                    ? 'bg-white dark:bg-[#2a2a3e] shadow-sm text-default-800'
                                    : 'text-default-500 hover:text-default-700'
                            }`}
                            onClick={() => setTab('login')}
                        >
                            登录账号
                        </button>
                        <button
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                tab === 'register'
                                    ? 'bg-white dark:bg-[#2a2a3e] shadow-sm text-default-800'
                                    : 'text-default-500 hover:text-default-700'
                            }`}
                            onClick={() => setTab('register')}
                        >
                            注册新账号
                        </button>
                    </div>

                    {/* 表单区 */}
                    {tab === 'login' ? (
                        <LoginForm onSuccess={handleSuccess} />
                    ) : (
                        <RegisterForm onSuccess={handleSuccess} />
                    )}
                </div>
            </div>

            {/* Toast 通知 */}
            <Toaster
                position='top-center'
                toastOptions={{
                    duration: 2500,
                    style: {
                        borderRadius: '10px',
                        fontSize: '13px',
                    },
                }}
            />
        </div>
    );
}
