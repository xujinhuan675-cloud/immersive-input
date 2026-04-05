import React, { useState } from 'react';
import { Input, Button, Checkbox } from '@nextui-org/react';
import { HiEye, HiEyeOff } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import { loginWithPassword, getRememberedEmail } from '../../../utils/auth';

export default function LoginForm({ onSuccess, onForgotPassword }) {
    const { t } = useTranslation();
    const [email, setEmail] = useState(getRememberedEmail());
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(!!getRememberedEmail());
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    async function handleLogin() {
        if (!email.trim()) { toast.error(t('login.error_email')); return; }
        if (!password) { toast.error(t('login.error_password')); return; }
        setLoading(true);
        try {
            const result = await loginWithPassword({ email: email.trim(), password, rememberMe });
            toast.success(t('login.success'));
            onSuccess?.(result);
        } catch (e) {
            toast.error(e.message ?? t('login.error_default'));
        } finally {
            setLoading(false);
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter') handleLogin();
    }

    function handleForgotPassword() {
        onForgotPassword?.();
    }

    return (
        <div className='flex flex-col gap-4'>
            <Input
                label={t('login.email_label')}
                placeholder={t('login.email_placeholder')}
                value={email}
                onValueChange={setEmail}
                onKeyDown={handleKeyDown}
                variant='bordered'
                size='sm'
                classNames={{
                    inputWrapper:
                        'border-1 border-default-200 hover:border-primary focus-within:!border-primary data-[hover=true]:border-primary',
                    label: 'text-default-500 text-xs',
                }}
            />

            <Input
                label={t('login.password_label')}
                placeholder={t('login.password_placeholder')}
                value={password}
                onValueChange={setPassword}
                onKeyDown={handleKeyDown}
                type={showPassword ? 'text' : 'password'}
                variant='bordered'
                size='sm'
                classNames={{
                    inputWrapper:
                        'border-1 border-default-200 hover:border-primary focus-within:!border-primary data-[hover=true]:border-primary',
                    label: 'text-default-500 text-xs',
                }}
                endContent={
                    <button
                        type='button'
                        tabIndex={-1}
                        className='text-default-400 hover:text-default-600 transition-colors'
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? (
                            <HiEyeOff className='text-base' />
                        ) : (
                            <HiEye className='text-base' />
                        )}
                    </button>
                }
            />

            <div className='flex justify-between items-center -mt-1'>
                <Checkbox
                    isSelected={rememberMe}
                    onValueChange={setRememberMe}
                    size='sm'
                    color='primary'
                    classNames={{
                        label: 'text-xs text-default-600',
                        wrapper: 'mr-1.5',
                    }}
                >
                    {t('login.remember')}
                </Checkbox>
                <button
                    type='button'
                    className='text-xs text-primary hover:underline cursor-pointer'
                    onClick={handleForgotPassword}
                >
                    {t('login.forgot')}
                </button>
            </div>

            <Button
                className='w-full bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white font-medium shadow-sm mt-1'
                size='md'
                isLoading={loading}
                onPress={handleLogin}
                radius='lg'
            >
                {t('login.submit')}
            </Button>

            {/* 预留：第三方登录入口 */}
            {/* <ThirdPartyLogin /> */}
        </div>
    );
}
