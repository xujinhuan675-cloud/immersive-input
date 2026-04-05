import React, { useState, useEffect } from 'react';
import { appWindow } from '@tauri-apps/api/window';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { HiGlobeAlt } from 'react-icons/hi';

import WindowControl from '../../components/WindowControl';
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';
import ResetPasswordForm from './components/ResetPasswordForm';
import { getLanguagePreference, saveLanguagePreference } from '../../utils/auth';
import { osType } from '../../utils/env';

export default function Login({ embedded = false, onSuccess }) {
    const { t, i18n } = useTranslation();
    const [tab, setTab] = useState('login'); // 'login' | 'register' | 'reset'

    useEffect(() => {
        // 读取保存的语言偏好，如果没有则默认英文
        const savedLanguage = getLanguagePreference();
        if (i18n.language !== savedLanguage) {
            i18n.changeLanguage(savedLanguage);
        }
        
        if (!embedded && appWindow.label === 'login') {
            appWindow.show();
        }
    }, [embedded, i18n]);

    function toggleLanguage() {
        const newLang = i18n.language === 'zh_cn' ? 'en' : 'zh_cn';
        i18n.changeLanguage(newLang);
        // 保存语言偏好
        saveLanguagePreference(newLang);
    }

    function handleSuccess({ user }) {
        // 登录/注册成功后的处理
        // 后续可在这里 emit Tauri 事件通知其他窗口用户已登录
        // emit('auth-state-changed', { action: 'login', user });
        onSuccess?.({ user });
        if (!embedded) {
            setTimeout(() => {
                appWindow.close();
            }, 1200);
        }
    }

    function handleResetSuccess() {
        toast.success(t('reset.success'));
        setTab('login');
    }

    return (
        <div
            className={`${embedded ? '' : 'h-screen'} overflow-y-auto flex flex-col bg-background select-none cursor-default`}
            style={{ userSelect: 'none' }}
        >
            {/* 标题栏（拖拽区 + 窗口控制按钮）*/}
            {!embedded && (
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
            )}

            {/* 中央卡片 */}
            <div className='flex-1 flex items-center justify-center px-6 py-2'>
                <div
                    className='w-full max-w-[430px] bg-content1 rounded-2xl shadow-xl px-8 pt-7 pb-8'
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
                            Immersive Input
                        </h1>
                        <p className='text-xs text-default-400 mt-1 tracking-widest'>
                            {t('login.subtitle')}
                        </p>
                        
                        {/* 语言切换按钮 */}
                        <button
                            onClick={toggleLanguage}
                            className='mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs text-default-600 hover:text-primary hover:bg-default-100 rounded-lg transition-colors'
                            title={i18n.language === 'zh_cn' ? 'Switch to English' : '切换到中文'}
                        >
                            <HiGlobeAlt className='text-base' />
                            <span>{i18n.language === 'zh_cn' ? 'English' : '中文'}</span>
                        </button>
                    </div>

                    {/* Tab 切换 */}
                    {tab !== 'reset' && (
                        <div className='flex bg-default-100 rounded-xl p-1 mb-5'>
                            <button
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                    tab === 'login'
                                        ? 'bg-white dark:bg-[#2a2a3e] shadow-sm text-default-800'
                                        : 'text-default-500 hover:text-default-700'
                                }`}
                                onClick={() => setTab('login')}
                            >
                                {t('login.tab_login')}
                            </button>
                            <button
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                    tab === 'register'
                                        ? 'bg-white dark:bg-[#2a2a3e] shadow-sm text-default-800'
                                        : 'text-default-500 hover:text-default-700'
                                }`}
                                onClick={() => setTab('register')}
                            >
                                {t('login.tab_register')}
                            </button>
                        </div>
                    )}

                    {/* 表单区 */}
                    {tab === 'login' ? (
                        <LoginForm
                            onSuccess={handleSuccess}
                            onForgotPassword={() => setTab('reset')}
                        />
                    ) : tab === 'register' ? (
                        <RegisterForm onSuccess={handleSuccess} />
                    ) : (
                        <ResetPasswordForm
                            onBack={() => setTab('login')}
                            onSuccess={handleResetSuccess}
                        />
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
