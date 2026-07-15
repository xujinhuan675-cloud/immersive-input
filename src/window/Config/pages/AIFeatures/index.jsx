import { Button, Switch, Tab, Tabs, Textarea } from '@nextui-org/react';
import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { MdDeleteOutline, MdKeyboardArrowDown } from 'react-icons/md';

import { SettingsRow, SettingsSection } from '../../../../components/SettingsSection';
import { useConfig } from '../../../../hooks/useConfig';
import { DEFAULT_STYLE_PROMPTS } from '../../../../services/light_ai/openai';
import AIConfig from '../Service/AIConfig';
import TextSelection from '../TextSelection';

function PromptRuleEditor({ label, value, setValue, placeholder, description, action }) {
    return (
        <div className='rounded-lg border border-default-200/80 bg-default-50/60 p-3'>
            <div className='mb-2 flex items-center justify-between gap-3'>
                <div className='min-w-0 text-[13px] font-medium text-default-700'>{label}</div>
                {action ? <div className='shrink-0'>{action}</div> : null}
            </div>
            <Textarea
                placeholder={placeholder}
                value={value ?? ''}
                onValueChange={(nextValue) => setValue(nextValue)}
                size='sm'
                variant='bordered'
                minRows={2}
                maxRows={6}
                description={description}
            />
        </div>
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
    const [promptChecklist, setPromptChecklist] = useConfig('ai_prompt_checklist', '');
    const [extraPromptRules, setExtraPromptRules] = useConfig('ai_extra_prompt_rules', []);
    const [showPromptEditor, setShowPromptEditor] = useState(false);

    const isChineseUI = i18n.language?.startsWith('zh');
    const inputHandleTitle = isChineseUI ? '输入框 AI 句柄' : 'Input AI Handle';
    const inputHandleDescription = isChineseUI
        ? '在输入框内按 Shift+Enter 时显示 AI 句柄。'
        : 'Show the AI handle when you press Shift+Enter in an input field.';
    const globalPreferenceTitle = isChineseUI ? '全局输出偏好' : 'Global Output Preferences';
    const globalPreferenceDesc = isChineseUI ? '统一润色输出风格。' : 'Apply a consistent polish style.';
    const globalPreferencePlaceholder = isChineseUI
        ? '例如：简洁、克制、短句。'
        : 'For example: concise, restrained, shorter sentences.';
    const outputRulesTitle = isChineseUI ? '输出规则' : 'Output Rules';
    const outputRulesDescription = isChineseUI
        ? '统一管理文本助手的输出偏好和高级 prompt。'
        : 'Manage AI polish preferences and advanced prompts together.';
    const advancedTitle = isChineseUI ? '高级风格规则' : 'Advanced Style Rules';
    const advancedDescription = isChineseUI ? '仅在需要覆盖默认规则时编辑。' : 'Edit only to override the defaults.';
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
        {
            key: 'checklist',
            label: t('config.ai.prompt_checklist'),
            value: promptChecklist,
            setValue: setPromptChecklist,
        },
    ];
    const normalizedExtraPromptRules = Array.isArray(extraPromptRules) ? extraPromptRules : [];
    const updateExtraPromptRule = (index, value) => {
        setExtraPromptRules(
            normalizedExtraPromptRules.map((item, itemIndex) => (itemIndex === index ? value : item))
        );
    };
    const addExtraPromptRule = () => {
        setExtraPromptRules([...normalizedExtraPromptRules, '']);
    };
    const deleteExtraPromptRule = (index) => {
        setExtraPromptRules(normalizedExtraPromptRules.filter((_, itemIndex) => itemIndex !== index));
    };

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
                <Tab
                    key='ai_features'
                    title={t('config.ai.capabilities_tab', {
                        defaultValue: isChineseUI ? 'AI 能力' : 'AI Capabilities',
                    })}
                >
                    <div className='mx-auto flex w-full max-w-[880px] flex-col gap-4 px-1 pb-2'>
                        <SettingsSection>
                            <SettingsRow
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

                            <SettingsRow
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

                            <SettingsRow
                                title={outputRulesTitle}
                                description={outputRulesDescription}
                                action={
                                    <Button
                                        isIconOnly
                                        size='sm'
                                        variant='light'
                                        className='h-8 w-8 min-w-8 rounded-lg text-default-500'
                                        aria-label={
                                            showPromptEditor
                                                ? t('common.collapse', { defaultValue: 'Collapse' })
                                                : t('common.expand', { defaultValue: 'Expand' })
                                        }
                                        onPress={() => setShowPromptEditor((value) => !value)}
                                    >
                                        <MdKeyboardArrowDown
                                            className={`text-[22px] transition-transform ${
                                                showPromptEditor ? 'rotate-180' : ''
                                            }`}
                                        />
                                    </Button>
                                }
                            >
                                {showPromptEditor ? (
                                    <div className='space-y-4'>
                                        <PromptRuleEditor
                                            label={globalPreferenceTitle}
                                            value={userPref}
                                            setValue={setUserPref}
                                            placeholder={globalPreferencePlaceholder}
                                            description={globalPreferenceDesc}
                                        />

                                        <div className='space-y-3 border-t border-default-100 pt-3'>
                                            <div>
                                                <div className='text-[13px] font-medium text-default-700'>
                                                    {advancedTitle}
                                                </div>
                                                <div className='mt-1 text-xs leading-5 text-default-500'>
                                                    {advancedDescription}
                                                </div>
                                            </div>

                                            {styleOptions.map(({ key, label, value, setValue }) => (
                                                <PromptRuleEditor
                                                    key={key}
                                                    label={label}
                                                    value={value}
                                                    setValue={setValue}
                                                    placeholder={DEFAULT_STYLE_PROMPTS[key]?.system ?? ''}
                                                    description={t('config.ai.prompt_empty')}
                                                    action={
                                                        <Button
                                                            isIconOnly
                                                            size='sm'
                                                            color='danger'
                                                            variant='light'
                                                            className='h-8 w-8 min-w-8 rounded-lg text-danger'
                                                            aria-label={t('common.clear')}
                                                            onPress={() => setValue('')}
                                                        >
                                                            <MdDeleteOutline className='text-[18px]' />
                                                        </Button>
                                                    }
                                                />
                                            ))}

                                            {normalizedExtraPromptRules.map((value, index) => (
                                                <PromptRuleEditor
                                                    key={`extra-prompt-${index}`}
                                                    label={t('config.ai.prompt_extra_label', {
                                                        index: index + 1,
                                                        defaultValue: `Prompt ${index + 1}`,
                                                    })}
                                                    value={value}
                                                    setValue={(nextValue) => updateExtraPromptRule(index, nextValue)}
                                                    placeholder={t('config.ai.prompt_extra_placeholder', {
                                                        defaultValue:
                                                            'Add an extra rule appended to every AI polish request.',
                                                    })}
                                                    description={t('config.ai.prompt_empty')}
                                                    action={
                                                        <Button
                                                            isIconOnly
                                                            size='sm'
                                                            color='danger'
                                                            variant='flat'
                                                            className='h-8 w-8 min-w-8 rounded-lg'
                                                            aria-label={t('common.delete')}
                                                            onPress={() => deleteExtraPromptRule(index)}
                                                        >
                                                            <MdDeleteOutline className='text-[18px]' />
                                                        </Button>
                                                    }
                                                />
                                            ))}

                                            <div className='flex justify-end'>
                                                <Button
                                                    size='sm'
                                                    variant='flat'
                                                    className='h-8 rounded-md px-3 text-[13px] font-medium'
                                                    onPress={addExtraPromptRule}
                                                >
                                                    {t('config.ai.prompt_add', { defaultValue: 'Add Prompt' })}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </SettingsRow>
                        </SettingsSection>
                        <AIConfig />
                    </div>
                </Tab>

                <Tab
                    key='text_selection'
                    title={t('config.text_selection.label')}
                >
                    <TextSelection />
                </Tab>
            </Tabs>
        </>
    );
}
