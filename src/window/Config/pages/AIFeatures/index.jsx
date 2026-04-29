import { Card, CardBody, Switch, Tab, Tabs, Textarea } from '@nextui-org/react';
import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { useConfig } from '../../../../hooks/useConfig';
import { DEFAULT_STYLE_PROMPTS } from '../../../../services/light_ai/openai';
import AIConfig from '../Service/AIConfig';
import TextSelection from '../TextSelection';

function SettingSection({ title, description, action, children, bordered = false }) {
    return (
        <section className={`${bordered ? 'border-t border-default-200/70' : ''} px-4 py-4`}>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                <div className='min-w-0 flex-1'>
                    <h3 className='text-[15px] font-semibold text-foreground'>{title}</h3>
                    {description ? (
                        <p className='mt-1 text-sm leading-6 text-default-500'>{description}</p>
                    ) : null}
                </div>
                {action ? <div className='shrink-0'>{action}</div> : null}
            </div>
            {children ? <div className='mt-3'>{children}</div> : null}
        </section>
    );
}

export default function AIFeatures() {
    const { t, i18n } = useTranslation();
    const [inputAiHandleEnabled, setInputAiHandleEnabled] = useConfig('input_ai_handle_enabled', true);
    const [incrementalExplain, setIncrementalExplain] = useConfig('incremental_explain', false);
    const [userPref, setUserPref] = useConfig('ai_user_preference', '');
    const [promptStrict, setPromptStrict] = useConfig('ai_prompt_strict', '');
    const [promptStructured, setPromptStructured] = useConfig('ai_prompt_structured', '');
    const [promptNatural, setPromptNatural] = useConfig('ai_prompt_natural', '');
    const [showPromptEditor, setShowPromptEditor] = useState(false);

    const isChineseUI = i18n.language?.startsWith('zh');
    const inputHandleTitle = isChineseUI
        ? '\u8f93\u5165\u6846 AI \u53e5\u67c4'
        : 'Input AI Handle';
    const inputHandleDescription = isChineseUI
        ? '\u5728\u8f93\u5165\u6846\u5185\u6309 Shift+Enter \u65f6\u663e\u793a AI \u53e5\u67c4\u3002'
        : 'Show the AI handle when you press Shift+Enter in an input field.';
    const globalPreferenceTitle = isChineseUI
        ? '\u5168\u5c40\u8f93\u51fa\u504f\u597d'
        : 'Global Output Preferences';
    const globalPreferenceDesc = isChineseUI
        ? '\u7edf\u4e00\u6da6\u8272\u8f93\u51fa\u98ce\u683c\u3002'
        : 'Apply a consistent polish style.';
    const globalPreferencePlaceholder = isChineseUI
        ? '\u4f8b\u5982\uff1a\u7b80\u6d01\u3001\u514b\u5236\u3001\u77ed\u53e5\u3002'
        : 'For example: concise, restrained, shorter sentences.';
    const advancedTitle = isChineseUI
        ? '\u9ad8\u7ea7\u98ce\u683c\u89c4\u5219'
        : 'Advanced Style Rules';
    const advancedDescription = isChineseUI
        ? '\u4ec5\u5728\u9700\u8981\u8986\u76d6\u9ed8\u8ba4\u89c4\u5219\u65f6\u7f16\u8f91\u3002'
        : 'Edit only to override the defaults.';
    const styleOptions = [
        {
            key: 'strict',
            label: t('config.ai.prompt_strict'),
            value: promptStrict,
            setValue: setPromptStrict,
        },
        {
            key: 'structured',
            label: t('config.ai.prompt_structured'),
            value: promptStructured,
            setValue: setPromptStructured,
        },
        {
            key: 'natural',
            label: t('config.ai.prompt_natural'),
            value: promptNatural,
            setValue: setPromptNatural,
        },
    ];

    return (
        <>
            <Toaster />
            <Tabs
                className='max-h-[calc(100%-40px)] overflow-y-auto'
                classNames={{
                    base: 'w-full',
                    tabList: 'mx-auto rounded-xl bg-default-100/80 p-1',
                    cursor: 'rounded-lg bg-content1 shadow-sm',
                    panel: 'pt-4',
                    tab: 'h-9 px-3',
                    tabContent: 'text-sm text-default-500 group-data-[selected=true]:text-foreground',
                }}
            >
                <Tab key='ai_features' title={t('config.ai.label')}>
                    <div className='mx-auto flex w-full max-w-[880px] flex-col gap-4 px-1 pb-2'>
                        <Card shadow='none' className='border border-default-200/70 bg-content1/90'>
                            <CardBody className='p-0'>
                                <SettingSection
                                    title={inputHandleTitle}
                                    description={inputHandleDescription}
                                    action={
                                        <Switch
                                            size='sm'
                                            isSelected={inputAiHandleEnabled ?? true}
                                            onValueChange={setInputAiHandleEnabled}
                                        />
                                    }
                                />

                                <SettingSection
                                    title={t('config.ai.incremental_explain')}
                                    description={t('config.ai.incremental_explain_desc')}
                                    action={
                                        <Switch
                                            size='sm'
                                            isSelected={incrementalExplain ?? false}
                                            onValueChange={setIncrementalExplain}
                                        />
                                    }
                                />

                                <SettingSection
                                    title={globalPreferenceTitle}
                                    description={globalPreferenceDesc}
                                >
                                    <Textarea
                                        placeholder={globalPreferencePlaceholder}
                                        value={userPref ?? ''}
                                        onValueChange={(value) => setUserPref(value)}
                                        size='sm'
                                        variant='bordered'
                                        minRows={3}
                                        maxRows={6}
                                    />
                                </SettingSection>

                                <SettingSection
                                    bordered
                                    title={advancedTitle}
                                    description={advancedDescription}
                                    action={
                                        <Switch
                                            size='sm'
                                            isSelected={showPromptEditor}
                                            onValueChange={setShowPromptEditor}
                                        />
                                    }
                                >
                                    {showPromptEditor ? (
                                        <div className='space-y-3'>
                                            {styleOptions.map(({ key, label, value, setValue }) => (
                                                <div
                                                    key={key}
                                                    className='rounded-[14px] border border-default-200/70 bg-default-50/50 p-3'
                                                >
                                                    <div className='mb-2 text-[13px] font-medium text-default-700'>
                                                        {label}
                                                    </div>
                                                    <Textarea
                                                        placeholder={DEFAULT_STYLE_PROMPTS[key]?.system ?? ''}
                                                        value={value ?? ''}
                                                        onValueChange={(nextValue) => setValue(nextValue)}
                                                        size='sm'
                                                        variant='bordered'
                                                        minRows={2}
                                                        maxRows={6}
                                                        description={t('config.ai.prompt_empty')}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </SettingSection>
                            </CardBody>
                        </Card>
                        <AIConfig />
                    </div>
                </Tab>

                <Tab key='text_selection' title={t('config.text_selection.label')}>
                    <TextSelection />
                </Tab>
            </Tabs>
        </>
    );
}
