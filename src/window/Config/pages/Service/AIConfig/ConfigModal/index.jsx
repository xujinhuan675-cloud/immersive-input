import { Button, Input, Modal, ModalBody, ModalContent, ModalHeader, Slider, Spacer } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { LuBrainCircuit } from 'react-icons/lu';

import { useConfig } from '../../../../../../hooks/useConfig';
import { useToastStyle } from '../../../../../../hooks';
import { requestAiChatCompletions } from '../../../../../../utils/aiGateway';
import {
    AI_API_DEFAULT_MODEL,
    AI_API_DEFAULT_URL,
    createDefaultAiApiConfig,
    getAiProviderId,
    getAiProviderPreset,
    getAiProviderTitle,
    getMergedAiApiConfig,
} from '../../../../../../utils/aiConfig';

async function testAiConnection(config) {
    const { data, text } = await requestAiChatCompletions(
        [{ role: 'user', content: 'Reply with "OK"' }],
        config,
        null,
        {
            temperature: 0.1,
        }
    );

    if (text) {
        return text;
    }

    throw new Error(JSON.stringify(data).slice(0, 120));
}

const FIELD_CLASS_NAMES = {
    base: 'w-full',
    mainWrapper: 'w-full',
    inputWrapper: 'h-10 rounded-lg shadow-none',
};

function FormRow({ label, description, children, alignTop = false }) {
    return (
        <div className={`grid grid-cols-[160px_minmax(0,1fr)] gap-4 ${alignTop ? 'items-start' : 'items-center'}`}>
            <div className='text-sm font-medium text-foreground'>{label}</div>
            <div className='w-full min-w-0'>
                {children}
                {description ? <div className='mt-1.5 text-xs leading-5 text-default-500'>{description}</div> : null}
            </div>
        </div>
    );
}

function AIApiConfigForm(props) {
    const { instanceKey, updateServiceInstanceList, onClose, onDelete } = props;
    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [aiConfig, setAiConfig] = useConfig(instanceKey, createDefaultAiApiConfig(), { sync: false });

    if (aiConfig) {
        const mergedConfig = getMergedAiApiConfig(aiConfig);
        const needsRepair = ['provider', 'apiUrl', 'apiKey', 'model', 'temperature', 'enable'].some(
            (key) => aiConfig[key] === undefined
        );

        if (needsRepair) {
            setAiConfig(mergedConfig);
        }
    }

    const mergedConfig = aiConfig !== null ? getMergedAiApiConfig(aiConfig) : null;
    const providerId = mergedConfig ? getAiProviderId(mergedConfig) : null;
    const providerPreset = providerId ? getAiProviderPreset(providerId) : null;
    const providerTitle = providerId
        ? t(`ai_config.providers.${providerId}`, {
              defaultValue: getAiProviderTitle(providerId),
          })
        : '';

    const updateConfig = (patch) => {
        setAiConfig({
            ...aiConfig,
            ...patch,
        });
    };

    const saveConfig = async () => {
        const nextConfig = getMergedAiApiConfig(aiConfig);
        setIsSaving(true);
        try {
            setAiConfig(nextConfig, true);
            updateServiceInstanceList(instanceKey);
            toast.success(t('common.save', { defaultValue: 'Saved' }), { style: toastStyle });
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestConnection = async () => {
        const nextConfig = getMergedAiApiConfig(aiConfig);
        if (!nextConfig.apiUrl || !nextConfig.model) {
            toast.error(t('ai_config.test_error_fields'), { style: toastStyle });
            return;
        }

        setIsTesting(true);
        try {
            const message = await testAiConnection(nextConfig);
            toast.success(
                t('ai_config.test_success', {
                    msg: String(message).slice(0, 30),
                    defaultValue: `Connected: ${message}`,
                }),
                { style: toastStyle }
            );
        } catch (error) {
            toast.error(
                t('ai_config.test_failed', {
                    msg: error?.message ?? String(error),
                    defaultValue: `Failed: ${error?.message ?? String(error)}`,
                }),
                { style: toastStyle }
            );
        } finally {
            setIsTesting(false);
        }
    };

    return (
        aiConfig !== null && (
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void saveConfig();
                }}
            >
                <Toaster />

                <div className='space-y-5'>
                    <FormRow
                        label='API URL'
                        description={t('ai_config.url_desc', {
                            provider: providerTitle,
                            defaultValue: 'Compatible with OpenAI API format.',
                        })}
                    >
                        <Input
                            placeholder={providerPreset?.apiUrl || AI_API_DEFAULT_URL}
                            value={aiConfig.apiUrl ?? ''}
                            variant='bordered'
                            classNames={FIELD_CLASS_NAMES}
                            onValueChange={(value) => {
                                updateConfig({ apiUrl: value });
                            }}
                        />
                    </FormRow>

                    <FormRow label='API Key'>
                        <Input
                            type='password'
                            placeholder='sk-...'
                            value={aiConfig.apiKey ?? ''}
                            variant='bordered'
                            classNames={FIELD_CLASS_NAMES}
                            onValueChange={(value) => {
                                updateConfig({ apiKey: value });
                            }}
                        />
                    </FormRow>

                    <FormRow
                        label={t('ai_config.model_label')}
                        description={t('ai_config.model_desc')}
                    >
                        <Input
                            placeholder={providerPreset?.model || AI_API_DEFAULT_MODEL}
                            value={aiConfig.model ?? ''}
                            variant='bordered'
                            classNames={FIELD_CLASS_NAMES}
                            onValueChange={(value) => {
                                updateConfig({ model: value });
                            }}
                        />
                    </FormRow>

                    <FormRow
                        label={t('ai_config.temperature', { n: Number(aiConfig.temperature ?? 0.7).toFixed(1) })}
                        alignTop
                    >
                        <div className='flex h-10 items-center'>
                            <Slider
                                size='sm'
                                step={0.1}
                                minValue={0}
                                maxValue={2}
                                value={Number(aiConfig.temperature ?? 0.7)}
                                className='w-full'
                                onChange={(value) => {
                                    updateConfig({
                                        temperature: Array.isArray(value) ? value[0] : value,
                                    });
                                }}
                            />
                        </div>
                    </FormRow>
                </div>

                <div className='mt-5 flex items-center justify-between border-t border-default-100 pt-3'>
                    <Button
                        type='button'
                        size='sm'
                        color='danger'
                        variant='light'
                        className='h-8 px-3 text-[13px] font-medium'
                        isDisabled={!onDelete}
                        onPress={onDelete}
                    >
                        {t('config.service.delete_service', { defaultValue: 'Delete service' })}
                    </Button>
                    <div className='flex items-center gap-2'>
                        <Button
                            type='button'
                            size='sm'
                            variant='flat'
                            className='h-8 rounded-md px-3 text-[13px] font-medium'
                            onPress={handleTestConnection}
                            isLoading={isTesting}
                        >
                            {isTesting
                                ? t('ai_config.test_loading')
                                : t('ai_config.test_btn', { defaultValue: 'Test Connection' })}
                        </Button>
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
                            size='sm'
                            isLoading={isSaving}
                            color='primary'
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

export default function ConfigModal(props) {
    const {
        serviceInstanceKey,
        isOpen,
        onOpenChange,
        updateServiceInstanceList,
        deleteServiceInstance,
        customServicesAllowed = true,
    } = props;
    const { t } = useTranslation();

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            scrollBehavior='inside'
        >
            <ModalContent className='max-h-[80vh]'>
                {(onClose) => (
                    <>
                        <ModalHeader>
                            <div className='flex items-center'>
                                <div className='flex h-[28px] w-[28px] items-center justify-center rounded-[10px] bg-primary-100 text-primary'>
                                    <LuBrainCircuit className='text-[16px]' />
                                </div>
                                <Spacer x={2} />
                                {t('ai_config.title', { defaultValue: 'AI Services' })}
                            </div>
                        </ModalHeader>
                        <ModalBody>
                            {customServicesAllowed ? (
                                <AIApiConfigForm
                                    instanceKey={serviceInstanceKey}
                                    updateServiceInstanceList={updateServiceInstanceList}
                                    onClose={onClose}
                                    onDelete={() => {
                                        const deleted = deleteServiceInstance?.(serviceInstanceKey);
                                        if (deleted) {
                                            onClose();
                                        }
                                    }}
                                />
                            ) : (
                                <div className='pb-5'>
                                    <div className='rounded-[12px] border border-default-200/70 bg-default-50 px-4 py-3'>
                                        <div className='text-sm font-semibold text-foreground'>
                                            {t('ai_config.custom_locked_title', {
                                                defaultValue: 'Custom AI services are locked',
                                            })}
                                        </div>
                                        <div className='mt-1 text-xs leading-5 text-default-500'>
                                            {t('ai_config.custom_locked_desc', {
                                                defaultValue:
                                                    'Your current plan uses the FlowGuide AI gateway. Upgrade to Pro to edit custom API services.',
                                            })}
                                        </div>
                                    </div>
                                    <div className='mt-5 flex justify-end'>
                                        <Button
                                            color='primary'
                                            onPress={onClose}
                                        >
                                            {t('common.confirm', { defaultValue: 'OK' })}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </ModalBody>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
