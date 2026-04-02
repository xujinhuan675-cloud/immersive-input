import React, { useState } from 'react';
import { Input, Button, Checkbox } from '@nextui-org/react';
import { HiEye, HiEyeOff } from 'react-icons/hi';
import toast from 'react-hot-toast';

import { loginWithPassword, getRememberedEmail } from '../../../utils/auth';

export default function LoginForm({ onSuccess }) {
    const [email, setEmail] = useState(getRememberedEmail());
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(!!getRememberedEmail());
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    async function handleLogin() {
        if (!email.trim()) {
            toast.error('请输入用户名或邮箱');
            return;
        }
        if (!password) {
            toast.error('请输入密码');
            return;
        }
        setLoading(true);
        try {
            const result = await loginWithPassword({
                email: email.trim(),
                password,
                rememberMe,
            });
            toast.success('登录成功');
            onSuccess?.(result);
        } catch (e) {
            toast.error(e.message ?? '登录失败，请重试');
        } finally {
            setLoading(false);
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter') handleLogin();
    }

    function handleForgotPassword() {
        toast('密码重置功能即将推出', { icon: '🔧' });
    }

    return (
        <div className='flex flex-col gap-4'>
            <Input
                label='用户名 / 邮箱'
                placeholder='请输入用户名或邮箱'
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
                label='密码'
                placeholder='请输入密码'
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
                    记住账号
                </Checkbox>
                <button
                    type='button'
                    className='text-xs text-primary hover:underline cursor-pointer'
                    onClick={handleForgotPassword}
                >
                    忘记密码
                </button>
            </div>

            <Button
                className='w-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white font-medium shadow-md mt-1'
                size='md'
                isLoading={loading}
                onPress={handleLogin}
                radius='lg'
            >
                登录
            </Button>

            {/* 预留：第三方登录入口 */}
            {/* <ThirdPartyLogin /> */}
        </div>
    );
}
