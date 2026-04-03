import { Toaster } from 'react-hot-toast';
import { CardBody, Switch, Slider, Button, Textarea } from '@nextui-org/react';
import { Card } from '@nextui-org/react';
import React, { useState } from 'react';

import { useConfig } from '../../../../hooks/useConfig';
import { DEFAULT_STYLE_PROMPTS } from '../../../../services/light_ai/openai';
import { useTranslation } from 'react-i18next';

export default function AIFeatures() {
    const { t } = useTranslation();
    const [hashTrigger, setHashTrigger] = useConfig('light_ai_hash_trigger', false);
    const [showToolbar, setShowToolbar] = useConfig('selection_show_toolbar', true);
    const [versionCount, setVersionCount] = useConfig('light_ai_version_count', 3);
    const [userPref, setUserPref] = useConfig('ai_user_preference', '');
    const [promptStrict, setPromptStrict] = useConfig('ai_prompt_strict', '');
    const [promptStructured, setPromptStructured] = useConfig('ai_prompt_structured', '');
    const [promptNatural, setPromptNatural] = useConfig('ai_prompt_natural', '');
    const [showPromptEditor, setShowPromptEditor] = useState(false);
    const [textSelectEnabled, setTextSelectEnabled] = useConfig('text_select_enabled', true);
    const [triggerMode, setTriggerMode] = useConfig('text_select_trigger_mode', 'auto');
    const [delayMs, setDelayMs] = useConfig('text_select_delay_ms', 300);
    const [autoHideMs, setAutoHideMs] = useConfig('text_select_auto_hide_ms', 6000);
    const [minLen, setMinLen] = useConfig('text_select_min_length', 2);
    const [btnTranslate, setBtnTranslate] = useConfig('toolbar_btn_translate', true);
    const [btnExplain, setBtnExplain] = useConfig('toolbar_btn_explain', true);
    const [btnFormat, setBtnFormat] = useConfig('toolbar_btn_format', true);
    const [btnLightai, setBtnLightai] = useConfig('toolbar_btn_lightai', true);

    const modeBtn = (val, label) => (
        <button key={val} onClick={() => setTriggerMode(val)} style={{
            padding: '5px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
            border: triggerMode === val ? '2px solid #4a7cfa' : '1px solid #ddd',
            background: triggerMode === val ? '#eff4ff' : '#fff',
            color: triggerMode === val ? '#4a7cfa' : '#555',
            fontWeight: triggerMode === val ? 600 : 400,
        }}>{label}</button>
    );

    const toggleBtn = (val, setter, label) => (
        <button key={label} onClick={() => setter(!val)} style={{
            padding: '4px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
            border: val !== false ? '1.5px solid #4a7cfa' : '1px solid #ddd',
            background: val !== false ? '#eff4ff' : '#f5f5f5',
            color: val !== false ? '#4a7cfa' : '#888',
        }}>{label}</button>
    );

    return (
        <div className='p-[10px] max-w-[800px]'>
            <Toaster />
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
                        <div className='flex items-center justify-between'>
                            <div>
                                <div className='text-[14px]'>{t('config.ai.show_toolbar')}</div>
                                <div className='text-[12px] text-default-400'>{t('config.ai.show_toolbar_desc')}</div>
                            </div>
                            <Switch isSelected={showToolbar ?? true} onValueChange={(v) => setShowToolbar(v)} size='sm' />
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
            <Card className='mb-[10px]'>
                <CardBody>
                    <h3 className='text-[16px] font-bold mb-[12px]'>{t('config.ai.toolbar_title')}</h3>
                    <div className='space-y-[14px]'>
                        <div className='flex items-center justify-between'>
                            <div>
                                <div className='text-[14px]'>{t('config.ai.toolbar_enable')}</div>
                                <div className='text-[12px] text-default-400'>{t('config.ai.toolbar_enable_desc')}</div>
                            </div>
                            <Switch isSelected={textSelectEnabled ?? true} onValueChange={setTextSelectEnabled} size='sm' />
                        </div>
                        <div>
                            <div className='text-[13px] text-default-600 mb-[6px]'>{t('config.ai.trigger_mode')}</div>
                            <div className='flex gap-[10px]'>
                                {modeBtn('auto', t('config.ai.trigger_auto'))}
                                {modeBtn('hotkey', t('config.ai.trigger_hotkey'))}
                            </div>
                            {triggerMode === 'hotkey' && (
                                <p className='text-[11px] text-default-400 mt-[5px]'>{t('config.ai.trigger_hotkey_tip')}</p>
                            )}
                        </div>
                        <div className='grid grid-cols-2 gap-[12px]'>
                            <div>
                                <div className='text-[12px] text-default-500 mb-1'>{t('config.ai.show_delay', { n: delayMs ?? 300 })}</div>
                                <Slider size='sm' step={50} minValue={50} maxValue={2000}
                                    value={Number(delayMs ?? 300)} onChange={setDelayMs} />
                            </div>
                            <div>
                                <div className='text-[12px] text-default-500 mb-1'>{t('config.ai.auto_hide', { n: autoHideMs ?? 6000 })}</div>
                                <Slider size='sm' step={500} minValue={1000} maxValue={30000}
                                    value={Number(autoHideMs ?? 6000)} onChange={setAutoHideMs} />
                            </div>
                        </div>
                        <div>
                            <div className='text-[12px] text-default-500 mb-1'>{t('config.ai.min_len', { n: minLen ?? 2 })}</div>
                            <Slider size='sm' step={1} minValue={1} maxValue={10}
                                value={Number(minLen ?? 2)} onChange={setMinLen} className='max-w-[200px]' />
                        </div>
                        <div>
                            <div className='text-[13px] text-default-600 mb-[6px]'>{t('config.ai.toolbar_buttons')}</div>
                            <div className='flex flex-wrap gap-[8px]'>
                                {toggleBtn(btnTranslate, setBtnTranslate, t('config.ai.btn_translate'))}
                                {toggleBtn(btnExplain,   setBtnExplain,   t('config.ai.btn_explain'))}
                                {toggleBtn(btnFormat,    setBtnFormat,    t('config.ai.btn_format'))}
                                {toggleBtn(btnLightai,   setBtnLightai,   t('config.ai.btn_lightai'))}
                            </div>
                        </div>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
}
