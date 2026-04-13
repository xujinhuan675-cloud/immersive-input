import React from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { CardBody } from '@nextui-org/react';
import { Switch } from '@nextui-org/react';
import { Input } from '@nextui-org/react';
import { Card } from '@nextui-org/react';

import { useConfig } from '../../../hooks/useConfig';
import { useToastStyle } from '../../../hooks';
import Backup from './Backup';

export default function AdvancedSettings() {
    const [proxyEnable, setProxyEnable] = useConfig('proxy_enable', false);
    const [proxyHost, setProxyHost] = useConfig('proxy_host', '');
    const [proxyPort, setProxyPort] = useConfig('proxy_port', '');
    const [proxyUsername, setProxyUsername] = useConfig('proxy_username', '');
    const [proxyPassword, setProxyPassword] = useConfig('proxy_password', '');
    const [noProxy, setNoProxy] = useConfig('no_proxy', 'localhost,127.0.0.1');
    const { t } = useTranslation();
    const toastStyle = useToastStyle();

    return (
        <>
            <Toaster />
            <Card>
                <CardBody>
                    <div className='config-item'>
                        <h3>{t('config.general.proxy.title')}</h3>
                        {proxyEnable !== null && (
                            <Switch
                                isSelected={proxyEnable}
                                onValueChange={(value) => {
                                    if (value && (proxyHost === '' || proxyPort === '')) {
                                        setProxyEnable(false);
                                        toast.error(t('config.general.proxy_error'), {
                                            duration: 3000,
                                            style: toastStyle,
                                        });
                                        return;
                                    }

                                    setProxyEnable(value);
                                    toast.success(t('config.general.proxy_change'), {
                                        duration: 1000,
                                        style: toastStyle,
                                    });
                                }}
                            />
                        )}
                    </div>
                    <div className='config-item'>
                        {proxyHost !== null && (
                            <Input
                                type='url'
                                variant='bordered'
                                isRequired
                                label={t('config.general.proxy.host')}
                                startContent={<span>http://</span>}
                                value={proxyHost}
                                onValueChange={(value) => {
                                    setProxyHost(value);
                                }}
                                className='mr-2'
                            />
                        )}
                        {proxyPort !== null && (
                            <Input
                                type='number'
                                variant='bordered'
                                isRequired
                                label={t('config.general.proxy.port')}
                                value={proxyPort}
                                onValueChange={(value) => {
                                    if (parseInt(value) > 65535) {
                                        setProxyPort(65535);
                                    } else if (parseInt(value) < 0) {
                                        setProxyPort('');
                                    } else {
                                        setProxyPort(parseInt(value));
                                    }
                                }}
                                className='ml-2'
                            />
                        )}
                    </div>
                    <div className='config-item'>
                        {proxyUsername !== null && (
                            <Input
                                type='text'
                                variant='bordered'
                                isDisabled
                                label={t('config.general.proxy.username')}
                                value={proxyUsername}
                                onValueChange={(value) => {
                                    setProxyUsername(value);
                                }}
                                className='mr-2'
                            />
                        )}
                        {proxyPassword !== null && (
                            <Input
                                type='password'
                                variant='bordered'
                                isDisabled
                                label={t('config.general.proxy.password')}
                                value={proxyPassword}
                                onValueChange={(value) => {
                                    setProxyPassword(value);
                                }}
                                className='ml-2'
                            />
                        )}
                    </div>
                    <div className='config-item'>
                        {noProxy !== null && (
                            <Input
                                variant='bordered'
                                label={t('config.general.proxy.no_proxy')}
                                value={noProxy}
                                onValueChange={(value) => {
                                    setNoProxy(value);
                                }}
                            />
                        )}
                    </div>
                </CardBody>
            </Card>
            <div className='mt-[10px]'>
                <Backup />
            </div>
        </>
    );
}
