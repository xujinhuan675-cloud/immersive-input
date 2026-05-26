import { DropdownTrigger } from '@nextui-org/react';
import { Input, Button } from '@nextui-org/react';
import { DropdownMenu } from '@nextui-org/react';
import { DropdownItem } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Dropdown } from '@nextui-org/react';
import React, { useState } from 'react';

import { useConfig } from '../../../hooks/useConfig';
import { useToastStyle } from '../../../hooks';
import { translate } from './index';
import { Language } from './index';

export function Config(props) {
    const { instanceKey, updateServiceList, onClose, deleteAction } = props;
    const { t } = useTranslation();
    const [deeplConfig, setDeeplConfig] = useConfig(
        instanceKey,
        {
            type: 'free',
            authKey: '',
            customUrl: '',
        },
        { sync: false }
    );
    const [isLoading, setIsLoading] = useState(false);

    const toastStyle = useToastStyle();
    const deeplType = deeplConfig?.type ?? 'free';
    const isFreeMode = deeplType === 'free';

    function saveConfig() {
        setDeeplConfig({ ...deeplConfig, type: deeplType, instanceName: undefined }, true);
        updateServiceList(instanceKey);
        onClose();
    }

    return (
        deeplConfig !== null && (
            <form
                onSubmit={(e) => {
                    e.preventDefault();

                    if (isFreeMode) {
                        saveConfig();
                        return;
                    }

                    setIsLoading(true);
                    translate('hello', Language.auto, Language.zh_cn, { config: deeplConfig }).then(
                        () => {
                            setIsLoading(false);
                            saveConfig();
                        },
                        (e) => {
                            setIsLoading(false);
                            toast.error(t('config.service.test_failed') + e.toString(), { style: toastStyle });
                        }
                    );
                }}
            >
                <Toaster />
                <div className='config-item'>
                    <h3 className='my-auto'>{t('services.translate.deepl.type')}</h3>
                    <Dropdown>
                        <DropdownTrigger>
                            <Button variant='bordered'>{t(`services.translate.deepl.${deeplType}`)}</Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            autoFocus='first'
                            aria-label='app language'
                            onAction={(key) => {
                                setDeeplConfig({
                                    ...deeplConfig,
                                    type: key,
                                });
                            }}
                        >
                            <DropdownItem key='free'>{t(`services.translate.deepl.free`)}</DropdownItem>
                            <DropdownItem key='api'>{t(`services.translate.deepl.api`)}</DropdownItem>
                            <DropdownItem key='deeplx'>{t(`services.translate.deepl.deeplx`)}</DropdownItem>
                        </DropdownMenu>
                    </Dropdown>
                </div>
                <div className={`config-item ${!isFreeMode && 'hidden'}`}>
                    <p className='text-[12px] text-default-500'>{t('services.translate.deepl.free_note')}</p>
                </div>
                <div className={`config-item ${deeplType !== 'api' && 'hidden'}`}>
                    <Input
                        label={t('services.translate.deepl.auth_key')}
                        labelPlacement='outside-left'
                        type='password'
                        value={deeplConfig['authKey']}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={(value) => {
                            setDeeplConfig({
                                ...deeplConfig,
                                authKey: value,
                            });
                        }}
                    />
                </div>
                <div className={`config-item ${deeplType !== 'deeplx' && 'hidden'}`}>
                    <Input
                        label={t('services.translate.deepl.custom_url')}
                        labelPlacement='outside-left'
                        value={deeplConfig.customUrl}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={(value) => {
                            setDeeplConfig({
                                ...deeplConfig,
                                customUrl: value,
                            });
                        }}
                    />
                </div>
                <div className='mt-4 flex items-center justify-between border-t border-default-100 pt-3'>
                    <div>{deleteAction}</div>
                    <div className='flex items-center gap-2'>
                        <Button
                            type='button'
                            size='sm'
                            variant='light'
                            className='h-8 px-3 text-[13px] font-medium text-default-600'
                            onPress={onClose}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type='submit'
                            isLoading={isLoading}
                            color='primary'
                            size='sm'
                            className='h-8 min-w-[72px] rounded-md px-3 text-[13px] font-medium'
                        >
                            {t('common.save')}
                        </Button>
                    </div>
                </div>
            </form>
        )
    );
}
