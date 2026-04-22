import { Button, Input } from '@nextui-org/react';
import { INSTANCE_NAME_CONFIG_KEY } from '../../../utils/service_instance';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/api/shell';
import React, { useState } from 'react';

import { TEST_IMAGE_BASE64 } from '../shared';
import { useConfig } from '../../../hooks/useConfig';
import { useToastStyle } from '../../../hooks';
import { recognize } from './index';
import { Language } from './index';

function SelectField({ label, value, onChange, options }) {
    return (
        <div className='config-item'>
            <div className='my-auto text-[length:--nextui-font-size-medium]'>{label}</div>
            <div className='w-full max-w-[50%]'>
                <select
                    value={value}
                    className='w-full rounded-[14px] border border-default-200 bg-default-50 px-3 py-2 text-sm outline-none transition-colors hover:border-default-300 focus:border-primary'
                    onChange={(event) => onChange(event.target.value)}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

export function Config(props) {
    const { instanceKey, updateServiceList, onClose } = props;
    const { t } = useTranslation();
    const [config, setConfig] = useConfig(
        instanceKey,
        {
            [INSTANCE_NAME_CONFIG_KEY]: t('services.recognize.qwen_ocr.title'),
            apiKey: '',
            region: 'cn',
            taskMode: 'auto',
            model: 'qwen-vl-ocr-latest',
        },
        { sync: false }
    );
    const [isLoading, setIsLoading] = useState(false);
    const toastStyle = useToastStyle();

    return (
        config !== null && (
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    setIsLoading(true);
                    recognize(TEST_IMAGE_BASE64, Language.auto, { config }).then(
                        () => {
                            setIsLoading(false);
                            setConfig(config, true);
                            updateServiceList(instanceKey);
                            onClose();
                        },
                        (error) => {
                            setIsLoading(false);
                            toast.error(t('config.service.test_failed') + error.toString(), { style: toastStyle });
                        }
                    );
                }}
            >
                <Toaster />
                <div className='config-item'>
                    <Input
                        label={t('services.instance_name')}
                        labelPlacement='outside-left'
                        value={config[INSTANCE_NAME_CONFIG_KEY]}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={(value) => {
                            setConfig({
                                ...config,
                                [INSTANCE_NAME_CONFIG_KEY]: value,
                            });
                        }}
                    />
                </div>
                <div className='config-item'>
                    <h3 className='my-auto'>{t('services.help')}</h3>
                    <Button
                        onPress={() => {
                            open('https://help.aliyun.com/zh/model-studio/qwen-vl-ocr');
                        }}
                    >
                        {t('services.help')}
                    </Button>
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.recognize.qwen_ocr.api_key')}
                        labelPlacement='outside-left'
                        type='password'
                        value={config.apiKey}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={(value) => {
                            setConfig({
                                ...config,
                                apiKey: value,
                            });
                        }}
                    />
                </div>
                <SelectField
                    label={t('services.recognize.qwen_ocr.region')}
                    value={config.region}
                    onChange={(value) => {
                        setConfig({
                            ...config,
                            region: value,
                        });
                    }}
                    options={[
                        { value: 'cn', label: t('services.recognize.qwen_ocr.region_cn') },
                        { value: 'us', label: t('services.recognize.qwen_ocr.region_us') },
                        { value: 'intl', label: t('services.recognize.qwen_ocr.region_intl') },
                    ]}
                />
                <SelectField
                    label={t('services.recognize.qwen_ocr.mode')}
                    value={config.taskMode}
                    onChange={(value) => {
                        setConfig({
                            ...config,
                            taskMode: value,
                        });
                    }}
                    options={[
                        { value: 'auto', label: t('services.recognize.qwen_ocr.mode_auto') },
                        {
                            value: 'text_recognition',
                            label: t('services.recognize.qwen_ocr.mode_text_recognition'),
                        },
                        {
                            value: 'advanced_recognition',
                            label: t('services.recognize.qwen_ocr.mode_advanced_recognition'),
                        },
                        { value: 'multi_lan', label: t('services.recognize.qwen_ocr.mode_multi_lan') },
                    ]}
                />
                <div className='config-item'>
                    <Input
                        label={t('services.recognize.qwen_ocr.model')}
                        labelPlacement='outside-left'
                        value={config.model}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={(value) => {
                            setConfig({
                                ...config,
                                model: value,
                            });
                        }}
                    />
                </div>
                <Button
                    type='submit'
                    isLoading={isLoading}
                    color='primary'
                    fullWidth
                >
                    {t('common.save')}
                </Button>
            </form>
        )
    );
}
