import React, { useEffect, useRef, useState } from 'react';
import { Input, Button } from '@nextui-org/react';
import { HiEye, HiEyeOff } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import { registerWithEmail, sendEmailCode } from '../../../utils/auth';

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

export default function RegisterForm({ onSuccess }) {
    const { t } = useTranslation();
    const [username, setUsername] = useState('');
    const [emailPrefix, setEmailPrefix] = useState('');
    const [emailDomain, setEmailDomain] = useState('qq.com');
    const [inviteCode, setInviteCode] = useState('');
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
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const incomingInviteCode = String(params.get('invite') || '')
            .trim()
            .toUpperCase();
        if (incomingInviteCode) {
            setInviteCode(incomingInviteCode);
        }
    }, []);

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, []);

    async function handleSendCode() {
        if (!emailPrefix.trim()) { toast.error(t('login.error_email_prefix')); return; }
        if (!fullEmail.includes('@')) { toast.error(t('login.error_email_required')); return; }
        if (countdown > 0 || codeSending) return;

        setCodeSending(true);
        try {
            const resp = await sendEmailCode({ email: fullEmail });
            const cd = Number(resp?.cooldown_seconds ?? 60);
            toast.success(t('login.send_success'));
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
            toast.error(e.message ?? t('login.error_sending'));
        } finally {
            setCodeSending(false);
        }
    }

    async function handleRegister() {
        if (!username.trim()) { toast.error(t('login.error_username')); return; }
        if (!emailPrefix.trim()) { toast.error(t('login.error_email_required')); return; }
        if (!code.trim()) { toast.error(t('login.error_code')); return; }
        if (!password) { toast.error(t('login.error_password_required')); return; }
        if (password.length < 8) { toast.error(t('login.error_password_length')); return; }
        
        // 验证密码复杂度：必须包含数字、小写字母、大写字母
        const hasNumber = /\d/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasUpperCase = /[A-Z]/.test(password);
        
        if (!hasNumber) { toast.error(t('login.error_password_no_number')); return; }
        if (!hasLowerCase) { toast.error(t('login.error_password_no_lowercase')); return; }
        if (!hasUpperCase) { toast.error(t('login.error_password_no_uppercase')); return; }
        
        if (password !== confirmPassword) { toast.error(t('login.error_password_mismatch')); return; }
        setLoading(true);
        try {
            const result = await registerWithEmail({
                username: username.trim(),
                email: fullEmail,
                password,
                code: code.trim(),
                inviteCode: inviteCode.trim(),
            });
            toast.success(t('login.success_register'));
            onSuccess?.(result);
        } catch (e) {
            toast.error(e.message ?? t('login.error_register_default'));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className='flex flex-col gap-3'>
            {/* 用户名 */}
            <Input
                label={t('login.username_label')}
                placeholder={t('login.username_placeholder')}
                value={username}
                onValueChange={setUsername}
                variant='bordered'
                size='sm'
                classNames={{
                    inputWrapper: INPUT_WRAPPER,
                    label: 'text-default-500 text-xs',
                }}
            />

            {/* 邮箱 + 域名选择 */}
            <div className='flex flex-col gap-1'>
                <span className='text-xs text-default-500 pl-1'>{t('login.email_section')}</span>
                <div className='flex items-center gap-1.5'>
                    <Input
                        placeholder={t('login.email_prefix')}
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
                <p className='text-[11px] text-default-400 pl-1'>{t('login.email_hint')}</p>
            </div>

            {/* 密码 */}
            <div className='flex flex-col gap-1'>
                <Input
                    label={t('login.password_label')}
                    placeholder={t('login.password_placeholder')}
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
                <p className='text-[11px] text-default-400 pl-1'>{t('login.reg_password_hint')}</p>
            </div>

            {/* 确认密码 */}
            <Input
                label={t('login.confirm_password_label')}
                placeholder={t('login.confirm_password_placeholder')}
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

            {/* 验证码 */}
            <Input
                label={t('login.invite_code_label')}
                placeholder={t('login.invite_code_placeholder')}
                value={inviteCode}
                onValueChange={(value) => setInviteCode(String(value || '').toUpperCase())}
                variant='bordered'
                size='sm'
                classNames={{
                    inputWrapper: INPUT_WRAPPER,
                    label: 'text-default-500 text-xs',
                }}
                description={t('login.invite_code_hint')}
            />

            <div className='flex flex-col gap-1'>
                <div className='flex items-center gap-2'>
                    <Input
                        label={t('login.code_label')}
                        placeholder={t('login.code_placeholder')}
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
                        {countdown > 0 ? t('login.resend', { n: countdown }) : t('login.send_code')}
                    </Button>
                </div>
            </div>

            {/* 注册按钮 */}
            <Button
                className='w-full mt-1 bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white font-medium shadow-sm'
                size='md'
                isLoading={loading}
                onPress={handleRegister}
                radius='lg'
            >
                {t('login.register_btn')}
            </Button>

            {/* 预留：注册协议 / 邀请码 / 会员激活码 入口 */}
            {/* <AgreementSection /> */}
        </div>
    );
}
