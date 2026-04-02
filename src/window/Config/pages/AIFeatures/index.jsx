import { Toaster } from 'react-hot-toast';
import { CardBody, Switch, Slider, Button, Textarea } from '@nextui-org/react';
import { Card } from '@nextui-org/react';
import React, { useState } from 'react';

import { useConfig } from '../../../../hooks/useConfig';
import { DEFAULT_STYLE_PROMPTS } from '../../../../services/light_ai/openai';

export default function AIFeatures() {
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
                API 配置已移至 <b>服务 &rarr; AI API</b> 标签页
            </p>
            <Card className='mb-[10px]'>
                <CardBody>
                    <h3 className='text-[16px] font-bold mb-[6px]'>个人写作偏好</h3>
                    <p className='text-[12px] text-default-400 mb-[10px]'>
                        这段文字会附加到每次轻AI的 System Prompt，让 AI 更贴合你的表达风格。
                    </p>
                    <Textarea placeholder='在此填写你的写作风格偏好...' value={userPref ?? ''}
                        onValueChange={(v) => setUserPref(v)} size='sm' variant='bordered' minRows={2} maxRows={5} />
                </CardBody>
            </Card>
            <Card className='mb-[10px]'>
                <CardBody>
                    <h3 className='text-[16px] font-bold mb-[12px]'>轻AI（文本润色）</h3>
                    <div className='space-y-[12px]'>
                        <div className='flex items-center justify-between'>
                            <div>
                                <div className='text-[14px]'># 符号触发轻AI</div>
                                <div className='text-[12px] text-default-400'>复制以 # 结尾的文本时自动触发轻AI润色窗口</div>
                            </div>
                            <Switch isSelected={hashTrigger ?? false} onValueChange={(v) => setHashTrigger(v)} size='sm' />
                        </div>
                        <div className='flex items-center justify-between'>
                            <div>
                                <div className='text-[14px]'>划词后先显示工具栏</div>
                                <div className='text-[12px] text-default-400'>关闭则划词后直接弹出翻译窗口</div>
                            </div>
                            <Switch isSelected={showToolbar ?? true} onValueChange={(v) => setShowToolbar(v)} size='sm' />
                        </div>
                        <div>
                            <div className='text-[13px] text-default-500 mb-1'>同时生成版本数：{versionCount ?? 3}</div>
                            <Slider size='sm' step={1} minValue={1} maxValue={3} value={Number(versionCount ?? 3)}
                                onChange={(v) => setVersionCount(v)} className='max-w-[160px]' />
                        </div>
                        <Button size='sm' variant='light' onPress={() => setShowPromptEditor(!showPromptEditor)}>
                            {showPromptEditor ? '收起' : '自定义润色风格 Prompt'}
                        </Button>
                        {showPromptEditor && (
                            <div className='space-y-[10px] mt-[4px]'>
                                {[
                                    { key: 'strict', label: '严谨审慎', val: promptStrict, set: setPromptStrict },
                                    { key: 'structured', label: '结构清晰', val: promptStructured, set: setPromptStructured },
                                    { key: 'natural', label: '口语自然', val: promptNatural, set: setPromptNatural },
                                ].map(({ key, label, val, set }) => (
                                    <div key={key}>
                                        <div className='text-[12px] font-medium text-default-600 mb-1'>{label}</div>
                                        <Textarea placeholder={DEFAULT_STYLE_PROMPTS[key]?.system ?? ''} value={val ?? ''}
                                            onValueChange={(v) => set(v)} size='sm' variant='bordered' minRows={2} maxRows={6}
                                            description='留空则使用默认 prompt' />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CardBody>
            </Card>
            <Card className='mb-[10px]'>
                <CardBody>
                    <h3 className='text-[16px] font-bold mb-[12px]'>划词工具栏</h3>
                    <div className='space-y-[14px]'>
                        <div className='flex items-center justify-between'>
                            <div>
                                <div className='text-[14px]'>启用划词工具栏</div>
                                <div className='text-[12px] text-default-400'>关闭后划词不会出现任何提示</div>
                            </div>
                            <Switch isSelected={textSelectEnabled ?? true} onValueChange={setTextSelectEnabled} size='sm' />
                        </div>
                        <div>
                            <div className='text-[13px] text-default-600 mb-[6px]'>触发方式</div>
                            <div className='flex gap-[10px]'>
                                {modeBtn('auto', '划词即弹出（自动）')}
                                {modeBtn('hotkey', '快捷键触发')}
                            </div>
                            {triggerMode === 'hotkey' && (
                                <p className='text-[11px] text-default-400 mt-[5px]'>
                                    在偏好设置 → 快捷键中配置「划词翻译」快捷键，即可指定工具栏触发键。
                                </p>
                            )}
                        </div>
                        <div className='grid grid-cols-2 gap-[12px]'>
                            <div>
                                <div className='text-[12px] text-default-500 mb-1'>显示延迟 {delayMs ?? 300} ms</div>
                                <Slider size='sm' step={50} minValue={50} maxValue={2000}
                                    value={Number(delayMs ?? 300)} onChange={setDelayMs} />
                            </div>
                            <div>
                                <div className='text-[12px] text-default-500 mb-1'>自动隐藏 {autoHideMs ?? 6000} ms</div>
                                <Slider size='sm' step={500} minValue={1000} maxValue={30000}
                                    value={Number(autoHideMs ?? 6000)} onChange={setAutoHideMs} />
                            </div>
                        </div>
                        <div>
                            <div className='text-[12px] text-default-500 mb-1'>最少选中 {minLen ?? 2} 个字符才触发</div>
                            <Slider size='sm' step={1} minValue={1} maxValue={10}
                                value={Number(minLen ?? 2)} onChange={setMinLen} className='max-w-[200px]' />
                        </div>
                        <div>
                            <div className='text-[13px] text-default-600 mb-[6px]'>工具栏按钮</div>
                            <div className='flex flex-wrap gap-[8px]'>
                                {toggleBtn(btnTranslate, setBtnTranslate, '翻译')}
                                {toggleBtn(btnExplain,   setBtnExplain,   '解析')}
                                {toggleBtn(btnFormat,    setBtnFormat,    '格式化')}
                                {toggleBtn(btnLightai,   setBtnLightai,   '轻AI')}
                            </div>
                        </div>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
}
