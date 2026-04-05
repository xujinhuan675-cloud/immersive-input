import React, { useEffect, useRef, useState } from 'react';
import { Input, Button } from '@nextui-org/react';
import { HiEye, HiEyeOff, HiArrowLeft } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import { sendResetCode, resetPassword } from '../../../utils/auth';

const EMAIL_DOMAINS = [
    'qq.com',
    '163.com',
    '126.com',
    'gmail.com',
    'outlook.com',
    'hotmail.com',
    'yahoo.com',
    'sina.com',
];

const INPUT_WRAPPER =
    'border-1 border-default-200 hover:border-primary focus-within:!border-primary data-[hover=true]:border-primary';

export default function ResetPasswordForm({ onBack, onSuccess }) {
    const { t } = useTranslation();
    const [emailPrefix, setEmailPrefix] = useState('');
    const [emailDomain, setEmailDomain] = useState('qq.com');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [codeSending, setCodeSending] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const timerRef = useRef(null);

    const fullEmail = emailPrefix.trim() ? `${emailPrefix.trim()}@${emailDomain}` : '';

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, []);

    async function handleSendCode() {
        if (!emailPrefix.trim()) {
            toast.error(t('reset.error_email_prefix'));
            return;
        }
        if (!fullEmail.includes('@')) {
            toast.error(t('reset.error_email_required'));
            return;
        }
        if (countdown > 0 || codeSending) return;

        setCodeSending(true);
        try {
            const resp = await sendResetCode({ email: fullEmail });
            const cd = Number(resp?.cooldown_seconds ?? 60);
            toast.success(t('reset.send_success'));
            setCountdown(cd);
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
            timerRef.current = setInterval(() => {
                setCountdown((c) => {
                    if (c <= 1) {
                        if (timerRef.current) {
                            clearInterval(timerRef.current);
                            timerRef.current = null;
                        }
                        return 0;
                    }
                    return c - 1;
                });
            }, 1000);
        } catch (e) {
            toast.error(e.message ?? t('reset.error_sending'));
        } finally {
            setCodeSending(false);
        }
    }

    async function handleReset() {
        if (!emailPrefix.trim()) {
            toast.error(t('reset.error_email_required'));
            return;
        }
        if (!code.trim()) {
            toast.error(t('reset.error_code'));
            return;
        }
        if (!password) {
            toast.error(t('reset.error_password_required'));
            return;
        }
        if (password.length < 8) {
            toast.error(t('reset.error_password_length'));
            return;
        }

        // 验证密码复杂度
        const hasNumber = /\d/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasUpperCase = /[A-Z]/.test(password);

        if (!hasNumber) {
            toast.error(t('reset.error_password_no_number'));
            return;
        }
        if (!hasLowerCase) {
            toast.error(t('reset.error_password_no_lowercase'));
            return;
        }
        if (!hasUpperCase) {
            toast.error(t('reset.error_password_no_uppercase'));
            return;
        }

        if (password !== confirmPassword) {
            toast.error(t('reset.error_password_mismatch'));
            return;
        }

        setLoading(true);
        try {
            await resetPassword({
                email: fullEmail,
                code: code.trim(),
                password,
            });
            toast.success(t('reset.success'));
            onSuccess?.();
        } catch (e) {
            toast.error(e.message ?? t('reset.error_default'));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className='flex flex-col gap-3'>
            {/* 返回按钮 */}
            <button
                type='button'
                onClick={onBack}
                className='flex items-center gap-1.5 text-sm text-default-600 hover:text-primary transition-colors mb-1'
            >
                <HiArrowLeft className='text-base' />
                <span>{t('reset.back_to_login')}</span>
            </button>

            {/* 标题 */}
            <div className='mb-2'>
                <h3 className='text-lg font-semibold text-default-900'>{t('reset.title')}</h3>
                <p className='text-xs text-default-500 mt-1'>{t('reset.description')}</p>
            </div>

            {/* 邮箱 + 域名选择 */}
            <div className='flex flex-col gap-1'>
                <span className='text-xs text-default-500 pl-1'>{t('reset.email_section')}</span>
                <div className='flex items-center gap-1.5'>
                    <Input
                        placeholder={t('reset.email_prefix')}
                        value={emailPrefix}
                        onValueChange={setEmailPrefix}
                        variant='bordered'
                        size='sm'
                        classNames={{
                            base: 'flex-1',
                            inputWrapper: INPUT_WRAPPER,
                        }}
                    />
                    <span className='text-default-400 text-sm select-none'>@</span>
                    <select
                        value={emailDomain}
                        onChange={(e) => setEmailDomain(e.target.value)}
                        className='h-[36px] w-[120px] border border-default-200 rounded-xl bg-background text-default-700 text-xs px-2
                                   focus:border-primary focus:outline-none hover:border-primary transition-colors cursor-pointer'
                    >
                        {EMAIL_DOMAINS.map((d) => (
                            <option
                                key={d}
                                value={d}
                            >
                                {d}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 验证码 */}
            <div className='flex flex-col gap-1'>
                <div className='flex items-center gap-2'>
                    <Input
                        label={t('reset.code_label')}
                        placeholder={t('reset.code_placeholder')}
                        value={code}
                        onValueChange={setCode}
                        variant='bordered'
                        size='sm'
                        classNames={{
                            base: 'flex-1',
                            inputWrapper: INPUT_WRAPPER,
                            label: 'text-default-500 text-xs',
                        }}
                    />
                    <Button
                        size='sm'
                        radius='lg'
                        isLoading={codeSending}
                        isDisabled={countdown > 0}
                        onPress={handleSendCode}
                        className='shrink-0'
                    >
                        {countdown > 0 ? t('reset.resend', { n: countdown }) : t('reset.send_code')}
                    </Button>
                </div>
            </div>

            {/* 新密码 */}
            <div className='flex flex-col gap-1'>
                <Input
                    label={t('reset.password_label')}
                    placeholder={t('reset.password_placeholder')}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onValueChange={setPassword}
                    variant='bordered'
                    size='sm'
                    classNames={{
                        inputWrapper: INPUT_WRAPPER,
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
                <p className='text-[11px] text-default-400 pl-1'>{t('reset.password_hint')}</p>
            </div>

            {/* 确认密码 */}
            <Input
                label={t('reset.confirm_password_label')}
                placeholder={t('reset.confirm_password_placeholder')}
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onValueChange={setConfirmPassword}
                variant='bordered'
                size='sm'
                classNames={{
                    inputWrapper: INPUT_WRAPPER,
                    label: 'text-default-500 text-xs',
                }}
                endContent={
                    <button
                        type='button'
                        tabIndex={-1}
                        className='text-default-400 hover:text-default-600 transition-colors'
                        onClick={() => setShowConfirm(!showConfirm)}
                    >
                        {showConfirm ? (
                            <HiEyeOff className='text-base' />
                        ) : (
                            <HiEye className='text-base' />
                        )}
                    </button>
                }
            />

            {/* 重置按钮 */}
            <Button
                className='w-full mt-1 bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white font-medium shadow-sm'
                size='md'
                isLoading={loading}
                onPress={handleReset}
                radius='lg'
            >
                {t('reset.submit')}
            </Button>
        </div>
    );
}
