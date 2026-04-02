import React, { useState, useRef, useEffect } from 'react';
import { Input, Button } from '@nextui-org/react';
import { HiEye, HiEyeOff } from 'react-icons/hi';
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
    const [username, setUsername] = useState('');
    const [emailPrefix, setEmailPrefix] = useState('');
    const [emailDomain, setEmailDomain] = useState('qq.com');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [code, setCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [codeSending, setCodeSending] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const timerRef = useRef(null);

    const fullEmail = emailPrefix.trim() ? `${emailPrefix.trim()}@${emailDomain}` : '';

    // 清理计时器
    useEffect(() => () => clearInterval(timerRef.current), []);

    function startCountdown(seconds = 60) {
        setCountdown(seconds);
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }

    async function handleSendCode() {
        if (!emailPrefix.trim()) {
            toast.error('请先输入邮箱前缀');
            return;
        }
        setCodeSending(true);
        try {
            await sendEmailCode({ email: fullEmail });
            startCountdown(60);
            toast.success('验证码已发送，请查收邮件');
        } catch (e) {
            toast.error(e.message ?? '发送失败，请重试');
        } finally {
            setCodeSending(false);
        }
    }

    async function handleRegister() {
        if (!username.trim()) {
            toast.error('请输入用户名');
            return;
        }
        if (!emailPrefix.trim()) {
            toast.error('请输入邮箱');
            return;
        }
        if (!password) {
            toast.error('请输入密码');
            return;
        }
        if (password.length < 8) {
            toast.error('密码至少 8 位');
            return;
        }
        if (password !== confirmPassword) {
            toast.error('两次密码不一致');
            return;
        }
        if (!code.trim()) {
            toast.error('请输入验证码');
            return;
        }
        setLoading(true);
        try {
            const result = await registerWithEmail({
                username: username.trim(),
                email: fullEmail,
                password,
                code: code.trim(),
            });
            toast.success('注册成功，欢迎加入！');
            onSuccess?.(result);
        } catch (e) {
            toast.error(e.message ?? '注册失败，请重试');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className='flex flex-col gap-3'>
            {/* 用户名 */}
            <Input
                label='用户名'
                placeholder='输入用户名'
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
                <span className='text-xs text-default-500 pl-1'>邮箱</span>
                <div className='flex items-center gap-1.5'>
                    <Input
                        placeholder='邮箱前缀'
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
                <p className='text-[11px] text-default-400 pl-1'>仅支持主流邮箱注册，将用于找回密码</p>
            </div>

            {/* 密码 */}
            <div className='flex flex-col gap-1'>
                <Input
                    label='密码'
                    placeholder='输入密码'
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
                <p className='text-[11px] text-default-400 pl-1'>
                    密码要求：8 位以上，包含数字、小写字母、大写字母
                </p>
            </div>

            {/* 确认密码 */}
            <Input
                label='确认密码'
                placeholder='再次输入密码'
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
            <div className='flex flex-col gap-1'>
                <span className='text-xs text-default-500 pl-1'>验证码</span>
                <div className='flex gap-2'>
                    <Input
                        placeholder='输入验证码'
                        value={code}
                        onValueChange={setCode}
                        variant='bordered'
                        size='sm'
                        classNames={{
                            base: 'flex-1',
                            inputWrapper: INPUT_WRAPPER,
                        }}
                    />
                    <Button
                        size='sm'
                        variant='bordered'
                        radius='lg'
                        className='h-[36px] px-3 whitespace-nowrap text-xs border-[#A855F7] text-[#A855F7] hover:bg-[#A855F7]/10'
                        isDisabled={countdown > 0 || codeSending}
                        isLoading={codeSending}
                        onPress={handleSendCode}
                    >
                        {countdown > 0 ? `${countdown}s 后重发` : '发送验证码'}
                    </Button>
                </div>
            </div>

            {/* 注册按钮 */}
            <Button
                className='w-full mt-1 bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white font-medium shadow-md'
                size='md'
                isLoading={loading}
                onPress={handleRegister}
                radius='lg'
            >
                注册并登录
            </Button>

            {/* 预留：注册协议 / 邀请码 / 会员激活码 入口 */}
            {/* <AgreementSection /> */}
        </div>
    );
}
