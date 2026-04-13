import { Toaster } from 'react-hot-toast';
import { Button, Card, CardBody, Tab, Tabs, Textarea } from '@nextui-org/react';
import React, { useState } from 'react';

import { useConfig } from '../../../../hooks/useConfig';
import { DEFAULT_STYLE_PROMPTS } from '../../../../services/light_ai/openai';
import { useTranslation } from 'react-i18next';
import TextSelection from '../TextSelection';

export default function AIFeatures() {
    const { t, i18n } = useTranslation();
    const [versionCount, setVersionCount] = useConfig('light_ai_version_count', 3);
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
    const polishTitle = isChineseUI ? 'AI \u6da6\u8272' : 'AI Polish';
    const promptEditorTitle = isChineseUI ? '\u81ea\u5b9a\u4e49\u6da6\u8272\u98ce\u683c' : 'Custom Polish Styles';
    const promptEditorHint = isChineseUI
        ? '\u7528\u4e8e\u5b9a\u4e49\u4e09\u79cd\u6da6\u8272\u6a21\u5f0f\u5404\u81ea\u7684\u5e95\u5c42\u89c4\u5219\uff0c\u4e0d\u540c\u4e8e\u4e0a\u65b9\u7684\u5168\u5c40\u8f93\u51fa\u504f\u597d\u3002'
        : 'Defines the base rules for each polish mode and is separate from the global output preferences above.';
    const styleOptions = [
        { key: 'strict', label: t('config.ai.prompt_strict'), value: promptStrict, setValue: setPromptStrict },
        { key: 'structured', label: t('config.ai.prompt_structured'), value: promptStructured, setValue: setPromptStructured },
        { key: 'natural', label: t('config.ai.prompt_natural'), value: promptNatural, setValue: setPromptNatural },
    ];
    const versionOptions = [1, 2, 3];
    const currentVersionCount = Number(versionCount ?? 3);

    return (
        <>
            <Toaster />
            <Tabs className='flex justify-center max-h-[calc(100%-40px)] overflow-y-auto'>
                <Tab key='ai_features' title={t('config.ai.label')}>
                    <div className='p-[10px] max-w-[800px]'>
                        <Card className='mb-[10px]'>
                            <CardBody>
                                <h3 className='text-[16px] font-bold mb-[6px]'>{globalPreferenceTitle}</h3>
                                <p className='text-[12px] text-default-400 mb-[10px]'>{globalPreferenceDesc}</p>
                                <Textarea
                                    placeholder={globalPreferencePlaceholder}
                                    value={userPref ?? ''}
                                    onValueChange={(value) => setUserPref(value)}
                                    size='sm'
                                    variant='bordered'
                                    minRows={2}
                                    maxRows={5}
                                />
                            </CardBody>
                        </Card>

                        <Card className='mb-[10px]'>
                            <CardBody>
                                <div className='flex items-start justify-between gap-[12px] mb-[12px]'>
                                    <div>
                                        <h3 className='text-[16px] font-bold mb-[6px]'>{polishTitle}</h3>
                                        <p className='text-[12px] text-default-400'>{promptEditorHint}</p>
                                    </div>
                                    <Button
                                        size='sm'
                                        variant='flat'
                                        className='shrink-0'
                                        onPress={() => setShowPromptEditor((value) => !value)}
                                    >
                                        {showPromptEditor ? t('config.ai.prompt_editor_hide') : promptEditorTitle}
                                    </Button>
                                </div>

                                <div className='space-y-[12px]'>
                                    <div>
                                        <div className='text-[13px] text-default-500 mb-1'>
                                            {t('config.ai.version_count', { n: versionCount ?? 3 })}
                                        </div>
                                        <div className='inline-flex rounded-[12px] bg-default-100 p-[4px] gap-[4px]'>
                                            {versionOptions.map((count) => (
                                                <Button
                                                    key={count}
                                                    size='sm'
                                                    radius='sm'
                                                    color={currentVersionCount === count ? 'primary' : 'default'}
                                                    variant={currentVersionCount === count ? 'solid' : 'light'}
                                                    className='min-w-[56px]'
                                                    onPress={() => setVersionCount(count)}
                                                >
                                                    {isChineseUI ? `${count} 个` : `${count}`}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>

                                    {showPromptEditor && (
                                        <div className='space-y-[10px] rounded-[12px] bg-default-50 p-[12px]'>
                                            {styleOptions.map(({ key, label, value, setValue }) => (
                                                <div key={key}>
                                                    <div className='text-[12px] font-medium text-default-600 mb-1'>{label}</div>
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
                                    )}
                                </div>
                            </CardBody>
                        </Card>
                    </div>
                </Tab>

                <Tab key='text_selection' title={t('config.text_selection.label')}>
                    <TextSelection />
                </Tab>
            </Tabs>
        </>
    );
}
