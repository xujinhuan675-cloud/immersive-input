import { Toaster } from 'react-hot-toast';
import { Card, CardBody, Switch, Slider, Button, Textarea, Tabs, Tab } from '@nextui-org/react';
import React, { useState } from 'react';

import { useConfig } from '../../../../hooks/useConfig';
import { DEFAULT_STYLE_PROMPTS } from '../../../../services/light_ai/openai';
import { useTranslation } from 'react-i18next';
import TextSelection from '../TextSelection';

export default function AIFeatures() {
    const { t } = useTranslation();
    const [hashTrigger, setHashTrigger] = useConfig('light_ai_hash_trigger', false);
    const [versionCount, setVersionCount] = useConfig('light_ai_version_count', 3);
    const [userPref, setUserPref] = useConfig('ai_user_preference', '');
    const [promptStrict, setPromptStrict] = useConfig('ai_prompt_strict', '');
    const [promptStructured, setPromptStructured] = useConfig('ai_prompt_structured', '');
    const [promptNatural, setPromptNatural] = useConfig('ai_prompt_natural', '');
    const [showPromptEditor, setShowPromptEditor] = useState(false);

    return (
        <>
            <Toaster />
            <Tabs className='flex justify-center max-h-[calc(100%-40px)] overflow-y-auto'>
                <Tab key='ai_features' title={t('config.ai.label')}>
                    <div className='p-[10px] max-w-[800px]'>
                        <p className='text-[12px] text-default-400 mb-[10px]'>
                            {t('config.ai.api_tip')}
                        </p>
                        <Card className='mb-[10px]'>
                <CardBody>
                    <h3 className='text-[16px] font-bold mb-[6px]'>{t('config.ai.pref_title')}</h3>
                    <p className='text-[12px] text-default-400 mb-[10px]'>{t('config.ai.pref_desc')}</p>
                    <Textarea placeholder={t('config.ai.pref_placeholder')} value={userPref ?? ''}
                        onValueChange={(v) => setUserPref(v)} size='sm' variant='bordered' minRows={2} maxRows={5} />
                </CardBody>
            </Card>
            <Card className='mb-[10px]'>
                <CardBody>
                    <h3 className='text-[16px] font-bold mb-[12px]'>{t('config.ai.light_title')}</h3>
                    <div className='space-y-[12px]'>
                        <div className='flex items-center justify-between'>
                            <div>
                                <div className='text-[14px]'>{t('config.ai.hash_trigger')}</div>
                                <div className='text-[12px] text-default-400'>{t('config.ai.hash_trigger_desc')}</div>
                            </div>
                            <Switch isSelected={hashTrigger ?? false} onValueChange={(v) => setHashTrigger(v)} size='sm' />
                        </div>
                        <div>
                            <div className='text-[13px] text-default-500 mb-1'>{t('config.ai.version_count', { n: versionCount ?? 3 })}</div>
                            <Slider size='sm' step={1} minValue={1} maxValue={3} value={Number(versionCount ?? 3)}
                                onChange={(v) => setVersionCount(v)} className='max-w-[160px]' />
                        </div>
                        <Button size='sm' variant='light' onPress={() => setShowPromptEditor(!showPromptEditor)}>
                            {showPromptEditor ? t('config.ai.prompt_editor_hide') : t('config.ai.prompt_editor_show')}
                        </Button>
                        {showPromptEditor && (
                            <div className='space-y-[10px] mt-[4px]'>
                                {[
                                    { key: 'strict', label: t('config.ai.prompt_strict'), val: promptStrict, set: setPromptStrict },
                                    { key: 'structured', label: t('config.ai.prompt_structured'), val: promptStructured, set: setPromptStructured },
                                    { key: 'natural', label: t('config.ai.prompt_natural'), val: promptNatural, set: setPromptNatural },
                                ].map(({ key, label, val, set }) => (
                                    <div key={key}>
                                        <div className='text-[12px] font-medium text-default-600 mb-1'>{label}</div>
                                        <Textarea placeholder={DEFAULT_STYLE_PROMPTS[key]?.system ?? ''} value={val ?? ''}
                                            onValueChange={(v) => set(v)} size='sm' variant='bordered' minRows={2} maxRows={6}
                                            description={t('config.ai.prompt_empty')} />
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
