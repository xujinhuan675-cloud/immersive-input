import { Toaster } from 'react-hot-toast';
import { Button, Card, CardBody, Tab, Tabs, Textarea } from '@nextui-org/react';
import React, { useState } from 'react';

import { useConfig } from '../../../../hooks/useConfig';
import { DEFAULT_STYLE_PROMPTS } from '../../../../services/light_ai/openai';
import { useTranslation } from 'react-i18next';
import TextSelection from '../TextSelection';
import AIConfig from '../Service/AIConfig';

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
            <div className='mt-3'>{children}</div>
        </section>
    );
}

export default function AIFeatures() {
    const { t, i18n } = useTranslation();
    const [userPref, setUserPref] = useConfig('ai_user_preference', '');
    const [promptStrict, setPromptStrict] = useConfig('ai_prompt_strict', '');
    const [promptStructured, setPromptStructured] = useConfig('ai_prompt_structured', '');
    const [promptNatural, setPromptNatural] = useConfig('ai_prompt_natural', '');
    const [showPromptEditor, setShowPromptEditor] = useState(false);

    const isChineseUI = i18n.language?.startsWith('zh');
    const globalPreferenceTitle = isChineseUI ? '\u5168\u5c40\u8f93\u51fa\u504f\u597d' : 'Global Output Preferences';
    const globalPreferenceDesc = isChineseUI
        ? '\u5bf9\u6240\u6709\u6da6\u8272\u7ed3\u679c\u7edf\u4e00\u751f\u6548\uff0c\u7528\u4e8e\u7ea6\u675f\u957f\u671f\u56fa\u5b9a\u7684\u8bed\u6c14\u3001\u7bc7\u5e45\u548c\u63aa\u8f9e\u4e60\u60ef\u3002'
        : 'Applies to every polish result and defines your long-term tone, length, and wording preferences.';
    const globalPreferencePlaceholder = isChineseUI
        ? '\u4f8b\u5982\uff1a\u7b80\u6d01\u3001\u514b\u5236\uff0c\u5c11\u7528\u611f\u53f9\u53f7\uff0c\u4f18\u5148\u77ed\u53e5\uff0c\u907f\u514d\u8425\u9500\u8154\u3002'
        : 'For example: concise, restrained, fewer exclamation marks, shorter sentences, avoid marketing tone.';
    const advancedTitle = isChineseUI ? '\u9ad8\u7ea7\u98ce\u683c\u89c4\u5219' : 'Advanced Style Rules';
    const advancedDescription = isChineseUI
        ? '\u53ea\u5728\u4f60\u9700\u8981\u8986\u76d6\u5185\u7f6e\u6da6\u8272\u903b\u8f91\u65f6\u518d\u7f16\u8f91\u3002\u4e0d\u586b\u5199\u65f6\uff0c\u4f1a\u7ee7\u7eed\u4f7f\u7528\u9ed8\u8ba4 prompt\u3002'
        : 'Edit these only when you want to override the built-in polish logic. Leaving them empty keeps the defaults.';
    const collapsedHint = isChineseUI
        ? '\u5f53\u524d\u4f7f\u7528\u5185\u7f6e\u9ed8\u8ba4\u98ce\u683c\u89c4\u5219\u3002'
        : 'The built-in style rules are active right now.';
    const advancedToggleLabel = showPromptEditor
        ? t('config.ai.prompt_editor_hide')
        : isChineseUI
          ? '\u7f16\u8f91\u9ad8\u7ea7\u9879'
          : 'Edit Advanced';
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
                                <SettingSection title={globalPreferenceTitle} description={globalPreferenceDesc}>
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
                                        <Button
                                            size='sm'
                                            variant='light'
                                            radius='full'
                                            className='px-3 text-default-600'
                                            onPress={() => setShowPromptEditor((value) => !value)}
                                        >
                                            {advancedToggleLabel}
                                        </Button>
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
                                    ) : (
                                        <div className='rounded-[14px] border border-dashed border-default-200/80 bg-default-50/40 px-3 py-3 text-sm text-default-500'>
                                            {collapsedHint}
                                        </div>
                                    )}
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
