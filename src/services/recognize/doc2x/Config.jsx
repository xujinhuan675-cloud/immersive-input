import { Button, Input } from '@nextui-org/react';
import { INSTANCE_NAME_CONFIG_KEY } from '../../../utils/service_instance';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
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
            [INSTANCE_NAME_CONFIG_KEY]: t('services.recognize.doc2x.title'),
            token: '',
            mathFormat: 'latex',
            showDebug: 'false',
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
                    <Input
                        label={t('services.recognize.doc2x.token')}
                        labelPlacement='outside-left'
                        type='password'
                        value={config.token}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={(value) => {
                            setConfig({
                                ...config,
                                token: value,
                            });
                        }}
                    />
                </div>
                <SelectField
                    label={t('services.recognize.doc2x.math_format')}
                    value={config.mathFormat}
                    onChange={(value) => {
                        setConfig({
                            ...config,
                            mathFormat: value,
                        });
                    }}
                    options={[
                        { value: 'latex', label: t('services.recognize.doc2x.math_format_latex') },
                        { value: 'obsidian', label: t('services.recognize.doc2x.math_format_obsidian') },
                    ]}
                />
                <SelectField
                    label={t('services.recognize.doc2x.show_debug')}
                    value={config.showDebug}
                    onChange={(value) => {
                        setConfig({
                            ...config,
                            showDebug: value,
                        });
                    }}
                    options={[
                        { value: 'false', label: t('common.close') },
                        { value: 'true', label: t('common.ok') },
                    ]}
                />
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
