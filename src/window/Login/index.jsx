import React, { useEffect, useMemo, useRef, useState } from 'react';
import { appWindow } from '@tauri-apps/api/window';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { LuCheck, LuLanguages } from 'react-icons/lu';

import CompactDropdownButton from '../../components/CompactDropdownButton';
import WindowControl from '../../components/WindowControl';
import { osType } from '../../utils/env';
import { getLanguagePreference, saveLanguagePreference } from '../../utils/auth';
import { normalizeLanguageKey } from '../../utils/language';
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';
import ResetPasswordForm from './components/ResetPasswordForm';

const LOGIN_LANGUAGE_OPTIONS = Object.freeze([
    { key: 'en', label: 'English' },
    { key: 'zh_cn', label: '简体中文' },
]);

function resolveLoginLanguageKey(language) {
    const normalized = normalizeLanguageKey(language);
    if (normalized === 'zh_cn' || normalized === 'zh_tw') {
        return 'zh_cn';
    }
    return 'en';
}

export default function Login({ embedded = false, onSuccess }) {
    const { t, i18n } = useTranslation();
    const [tab, setTab] = useState('login');
    const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
    const languageMenuRef = useRef(null);
    const currentLanguageKey = resolveLoginLanguageKey(i18n.resolvedLanguage || i18n.language || 'en');
    const currentLanguageOption = useMemo(
        () =>
            LOGIN_LANGUAGE_OPTIONS.find((option) => option.key === currentLanguageKey) ||
            LOGIN_LANGUAGE_OPTIONS[0],
        [currentLanguageKey]
    );

    useEffect(() => {
        const savedLanguage = resolveLoginLanguageKey(getLanguagePreference());
        if (currentLanguageKey !== savedLanguage) {
            i18n.changeLanguage(savedLanguage);
        }

        if (!embedded && appWindow.label === 'login') {
            appWindow.show();
        }
    }, [currentLanguageKey, embedded, i18n]);

    useEffect(() => {
        if (!languageMenuOpen) return undefined;

        function handlePointerDown(event) {
            if (languageMenuRef.current && !languageMenuRef.current.contains(event.target)) {
                setLanguageMenuOpen(false);
            }
        }

        function handleEscape(event) {
            if (event.key === 'Escape') {
                setLanguageMenuOpen(false);
            }
        }

        document.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [languageMenuOpen]);

    function handleLanguageChange(nextLanguage) {
        if (!nextLanguage || nextLanguage === currentLanguageKey) {
            setLanguageMenuOpen(false);
            return;
        }

        i18n.changeLanguage(nextLanguage);
        saveLanguagePreference(nextLanguage);
        setLanguageMenuOpen(false);
    }

    function handleSuccess({ user }) {
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
            className={`${embedded ? '' : 'h-screen'} flex select-none flex-col overflow-y-auto bg-background cursor-default`}
            style={{ userSelect: 'none' }}
        >
            {!embedded && (
                <div
                    data-tauri-drag-region='true'
                    className='flex h-[35px] shrink-0 items-center justify-between px-2'
                >
                    <div
                        data-tauri-drag-region='true'
                        className='h-full flex-1'
                    />
                    {osType !== 'Darwin' ? <WindowControl /> : null}
                </div>
            )}

            <div className='flex flex-1 items-center justify-center px-6 py-2'>
                <div className='w-full max-w-[430px] rounded-2xl bg-content1 px-8 pb-8 pt-7 shadow-xl'>
                    <div className='mb-6 flex flex-col items-center'>
                        <img
                            src='icon.svg'
                            alt='Logo'
                            className='mb-3 h-[60px] w-[60px]'
                            draggable={false}
                        />
                        <h1 className='text-xl font-bold tracking-wide text-default-800'>
                            Immersive Input
                        </h1>
                        <p className='mt-1 text-xs tracking-widest text-default-400'>
                            {t('login.subtitle')}
                        </p>

                        <div className='mt-4 flex flex-col items-center gap-1.5'>
                            <p className='text-[10px] font-medium uppercase tracking-[0.22em] text-default-400'>
                                {t('login.language_label')}
                            </p>
                            <div
                                ref={languageMenuRef}
                                className='relative'
                            >
                                <CompactDropdownButton
                                    label={currentLanguageOption.label}
                                    open={languageMenuOpen}
                                    startContent={<LuLanguages className='text-base' />}
                                    aria-haspopup='menu'
                                    aria-expanded={languageMenuOpen}
                                    title={t('login.language_label')}
                                    className='rounded-full bg-white/90 px-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md'
                                    onClick={() => setLanguageMenuOpen((open) => !open)}
                                />

                                {languageMenuOpen ? (
                                    <div className='absolute left-1/2 top-full z-20 mt-2 w-48 -translate-x-1/2 rounded-2xl border border-default-200/80 bg-content1/95 p-1.5 shadow-lg backdrop-blur'>
                                        {LOGIN_LANGUAGE_OPTIONS.map((option) => {
                                            const active = option.key === currentLanguageOption.key;
                                            return (
                                                <button
                                                    key={option.key}
                                                    type='button'
                                                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                                                        active
                                                            ? 'bg-primary-50 text-primary-700'
                                                            : 'text-default-600 hover:bg-default-100 hover:text-default-900'
                                                    }`}
                                                    onClick={() => handleLanguageChange(option.key)}
                                                >
                                                    <span>{option.label}</span>
                                                    {active ? <LuCheck className='text-base' /> : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                            <p className='text-[11px] text-default-400'>
                                {t('login.language_hint')}
                            </p>
                        </div>
                    </div>

                    {tab !== 'reset' ? (
                        <div className='mb-5 flex rounded-xl bg-default-100 p-1'>
                            <button
                                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all duration-200 ${
                                    tab === 'login'
                                        ? 'bg-white shadow-sm text-default-800 dark:bg-[#2a2a3e]'
                                        : 'text-default-500 hover:text-default-700'
                                }`}
                                onClick={() => setTab('login')}
                            >
                                {t('login.tab_login')}
                            </button>
                            <button
                                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all duration-200 ${
                                    tab === 'register'
                                        ? 'bg-white shadow-sm text-default-800 dark:bg-[#2a2a3e]'
                                        : 'text-default-500 hover:text-default-700'
                                }`}
                                onClick={() => setTab('register')}
                            >
                                {t('login.tab_register')}
                            </button>
                        </div>
                    ) : null}

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
