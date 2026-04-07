import { unregister, isRegistered } from '@tauri-apps/api/globalShortcut';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { CardBody } from '@nextui-org/react';
import { Button } from '@nextui-org/react';
import { Input } from '@nextui-org/react';
import { Card } from '@nextui-org/react';
import React from 'react';

import { useConfig } from '../../../../hooks/useConfig';
import { useToastStyle } from '../../../../hooks';
import { osType } from '../../../../utils/env';
import { invoke } from '@tauri-apps/api';

// Maps browser KeyboardEvent.code to the rdev Key Debug string stored in config.
// rdev uses format!("{:?}", key) so the strings must match exactly.
const BROWSER_TO_RDEV = {
    // Modifier keys
    AltLeft: 'Alt', AltRight: 'Alt',
    ControlLeft: 'ControlLeft', ControlRight: 'ControlRight',
    ShiftLeft: 'ShiftLeft', ShiftRight: 'ShiftRight',
    MetaLeft: 'MetaLeft', MetaRight: 'MetaRight',
    // Whitespace / navigation
    Space: 'Space', Tab: 'Tab', Escape: 'Escape',
    CapsLock: 'CapsLock', Backspace: 'Backspace',
    Enter: 'Return', Insert: 'Insert', Delete: 'Delete',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'UpArrow', ArrowDown: 'DownArrow',
    ArrowLeft: 'LeftArrow', ArrowRight: 'RightArrow',
    // Symbol keys
    Backquote: 'BackQuote', Minus: 'Minus', Equal: 'Equal',
    BracketLeft: 'LeftBracket', BracketRight: 'RightBracket',
    Semicolon: 'SemiColon', Quote: 'Quote',
    Backslash: 'BackSlash', Comma: 'Comma', Period: 'Dot', Slash: 'Slash',
    // Letter keys
    KeyA: 'KeyA', KeyB: 'KeyB', KeyC: 'KeyC', KeyD: 'KeyD', KeyE: 'KeyE',
    KeyF: 'KeyF', KeyG: 'KeyG', KeyH: 'KeyH', KeyI: 'KeyI', KeyJ: 'KeyJ',
    KeyK: 'KeyK', KeyL: 'KeyL', KeyM: 'KeyM', KeyN: 'KeyN', KeyO: 'KeyO',
    KeyP: 'KeyP', KeyQ: 'KeyQ', KeyR: 'KeyR', KeyS: 'KeyS', KeyT: 'KeyT',
    KeyU: 'KeyU', KeyV: 'KeyV', KeyW: 'KeyW', KeyX: 'KeyX', KeyY: 'KeyY',
    KeyZ: 'KeyZ',
    // Digit keys (browser uses Digit prefix, rdev uses Num prefix)
    Digit1: 'Num1', Digit2: 'Num2', Digit3: 'Num3', Digit4: 'Num4',
    Digit5: 'Num5', Digit6: 'Num6', Digit7: 'Num7', Digit8: 'Num8',
    Digit9: 'Num9', Digit0: 'Num0',
    // Function keys
    F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
    F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
};

const keyMap = {
    Backquote: '`',
    Backslash: '\\',
    BracketLeft: '[',
    BracketRight: ']',
    Comma: ',',
    Equal: '=',
    Minus: '-',
    Plus: 'PLUS',
    Period: '.',
    Quote: "'",
    Semicolon: ';',
    Slash: '/',
    Backspace: 'Backspace',
    CapsLock: 'Capslock',
    ContextMenu: 'Contextmenu',
    Space: 'Space',
    Tab: 'Tab',
    Convert: 'Convert',
    Delete: 'Delete',
    End: 'End',
    Help: 'Help',
    Home: 'Home',
    PageDown: 'Pagedown',
    PageUp: 'Pageup',
    Escape: 'Esc',
    PrintScreen: 'Printscreen',
    ScrollLock: 'Scrolllock',
    Pause: 'Pause',
    Insert: 'Insert',
    Suspend: 'Suspend',
};

// Module-level object to track a pending single-key press for doubletap detection.
// Only one input can be focused at a time, so one object suffices.
const _pending = { key: null, time: null };

export default function Hotkey() {
    const [selectionTranslate, setSelectionTranslate] = useConfig('hotkey_selection_translate', '');
    const [inputTranslate, setInputTranslate] = useConfig('hotkey_input_translate', '');
    const [ocrRecognize, setOcrRecognize] = useConfig('hotkey_ocr_recognize', '');
    const [ocrTranslate, setOcrTranslate] = useConfig('hotkey_ocr_translate', '');
    const [lightAi, setLightAi] = useConfig('hotkey_light_ai', '');
    const [vaultQuickAdd, setVaultQuickAdd] = useConfig('hotkey_vault_quick_add', '');
    const [vaultQuickFill, setVaultQuickFill] = useConfig('hotkey_vault_quick_fill', '');
    const [phrases, setPhrases] = useConfig('hotkey_phrases', '');

    // Double-tap hotkey configs (single-key, no OK button needed — saved on keydown)
    const [dtSelectionTranslate, setDtSelectionTranslate] = useConfig('doubletap_selection_translate', '');
    const [dtInputTranslate, setDtInputTranslate] = useConfig('doubletap_input_translate', '');
    const [dtOcrRecognize, setDtOcrRecognize] = useConfig('doubletap_ocr_recognize', '');
    const [dtOcrTranslate, setDtOcrTranslate] = useConfig('doubletap_ocr_translate', '');
    const [dtLightAi, setDtLightAi] = useConfig('doubletap_light_ai', '');
    const [dtVaultQuickAdd, setDtVaultQuickAdd] = useConfig('doubletap_vault_quick_add', '');
    const [dtVaultQuickFill, setDtVaultQuickFill] = useConfig('doubletap_vault_quick_fill', '');
    const [dtPhrases, setDtPhrases] = useConfig('doubletap_phrases', '');

    const { t } = useTranslation();
    const toastStyle = useToastStyle();

    // Build a combo shortcut string from a keyboard event (modifier + key).
    function buildComboStr(e) {
        let newValue = '';
        if (e.ctrlKey) newValue = 'Ctrl';
        if (e.shiftKey) newValue = `${newValue}${newValue.length > 0 ? '+' : ''}Shift`;
        if (e.metaKey) newValue = `${newValue}${newValue.length > 0 ? '+' : ''}${osType === 'Darwin' ? 'Command' : 'Super'}`;
        if (e.altKey) newValue = `${newValue}${newValue.length > 0 ? '+' : ''}Alt`;
        let code = e.code;
        if (code.startsWith('Key')) code = code.substring(3);
        else if (code.startsWith('Digit')) code = code.substring(5);
        else if (code.startsWith('Numpad')) code = 'Num' + code.substring(6);
        else if (code.startsWith('Arrow')) code = code.substring(5);
        else if (code.startsWith('Intl')) code = code.substring(4);
        else if (/F\d+/.test(code)) { /* keep as-is */ }
        else if (keyMap[code] !== undefined) code = keyMap[code];
        else code = '';
        return `${newValue}${newValue.length > 0 && code.length > 0 ? '+' : ''}${code}`;
    }

    // Clear both combo and doubletap configs on input focus.
    function handleFocus(currentCombo, setCombo, setDt) {
        unregister(currentCombo);
        setCombo('');
        setDt('');
        _pending.key = null;
        _pending.time = null;
    }

    // Unified keydown handler: combo shortcut OR doubletap, depending on what the user presses.
    function handleKeyDown(e, setCombo, setDt) {
        e.preventDefault();
        if (e.keyCode === 8) {
            // Backspace: clear everything
            setCombo('');
            setDt('');
            _pending.key = null;
            _pending.time = null;
            return;
        }
        const hasModifier = e.ctrlKey || e.shiftKey || e.metaKey || e.altKey;
        if (hasModifier) {
            // Combo mode: modifier + key
            _pending.key = null;
            setCombo(buildComboStr(e));
            setDt('');
        } else {
            // Single key: detect doubletap within 300 ms
            const rdevKey = BROWSER_TO_RDEV[e.code];
            if (!rdevKey) return;
            const now = Date.now();
            if (_pending.key === rdevKey && _pending.time && (now - _pending.time) < 300) {
                // Second press of the same key within 300 ms → doubletap
                setDt(rdevKey);
                setCombo('');
                _pending.key = null;
                _pending.time = null;
            } else {
                // First press: remember and wait for the second
                _pending.key = rdevKey;
                _pending.time = now;
            }
        }
    }

    // Display value for the unified input: combo takes priority, then doubletap.
    function displayVal(combo, dt) {
        if (combo) return combo;
        if (dt) return `${dt}+${dt}`;
        return '';
    }

    // Confirm handler: combo needs OS registration; doubletap is already saved, just toast.
    function confirmHandler(hotkeyName, combo, dt) {
        if (combo !== '') {
            registerHandler(hotkeyName, combo);
        } else if (dt !== '') {
            toast.success(t('config.hotkey.success'), { style: toastStyle });
        }
    }

    function registerHandler(name, key) {
        isRegistered(key).then((res) => {
            if (res) {
                toast.error(t('config.hotkey.is_register'), { style: toastStyle });
            } else {
                invoke('register_shortcut_by_frontend', {
                    name: name,
                    shortcut: key,
                }).then(
                    () => { toast.success(t('config.hotkey.success'), { style: toastStyle }); },
                    (e) => { toast.error(e, { style: toastStyle }); }
                );
            }
        });
    }

    return (
        <Card>
            <Toaster />
            <CardBody>
                <div className='config-item'>
                    <h3 className='my-auto'>{t('config.hotkey.selection_translate')}</h3>
                    {selectionTranslate !== null && (
                        <Input
                            type='hotkey'
                            variant='bordered'
                            value={displayVal(selectionTranslate, dtSelectionTranslate)}
                            label={t('config.hotkey.set_hotkey')}
                            className='max-w-[50%]'
                            onKeyDown={(e) => handleKeyDown(e, setSelectionTranslate, setDtSelectionTranslate)}
                            onFocus={() => handleFocus(selectionTranslate, setSelectionTranslate, setDtSelectionTranslate)}
                            endContent={
                                (selectionTranslate !== '' || dtSelectionTranslate !== '') && (
                                    <Button size='sm' variant='flat'
                                        onPress={() => confirmHandler('hotkey_selection_translate', selectionTranslate, dtSelectionTranslate)}
                                    >{t('common.ok')}</Button>
                                )
                            }
                        />
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto'>{t('config.hotkey.input_translate')}</h3>
                    {inputTranslate !== null && (
                        <Input
                            type='hotkey'
                            variant='bordered'
                            value={displayVal(inputTranslate, dtInputTranslate)}
                            label={t('config.hotkey.set_hotkey')}
                            className='max-w-[50%]'
                            onKeyDown={(e) => handleKeyDown(e, setInputTranslate, setDtInputTranslate)}
                            onFocus={() => handleFocus(inputTranslate, setInputTranslate, setDtInputTranslate)}
                            endContent={
                                (inputTranslate !== '' || dtInputTranslate !== '') && (
                                    <Button size='sm' variant='flat'
                                        onPress={() => confirmHandler('hotkey_input_translate', inputTranslate, dtInputTranslate)}
                                    >{t('common.ok')}</Button>
                                )
                            }
                        />
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto'>{t('config.hotkey.ocr_recognize')}</h3>
                    {ocrRecognize !== null && (
                        <Input
                            type='hotkey'
                            variant='bordered'
                            value={displayVal(ocrRecognize, dtOcrRecognize)}
                            label={t('config.hotkey.set_hotkey')}
                            className='max-w-[50%]'
                            onKeyDown={(e) => handleKeyDown(e, setOcrRecognize, setDtOcrRecognize)}
                            onFocus={() => handleFocus(ocrRecognize, setOcrRecognize, setDtOcrRecognize)}
                            endContent={
                                (ocrRecognize !== '' || dtOcrRecognize !== '') && (
                                    <Button size='sm' variant='flat'
                                        onPress={() => confirmHandler('hotkey_ocr_recognize', ocrRecognize, dtOcrRecognize)}
                                    >{t('common.ok')}</Button>
                                )
                            }
                        />
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto'>{t('config.hotkey.ocr_translate')}</h3>
                    {ocrTranslate !== null && (
                        <Input
                            type='hotkey'
                            variant='bordered'
                            value={displayVal(ocrTranslate, dtOcrTranslate)}
                            label={t('config.hotkey.set_hotkey')}
                            className='max-w-[50%]'
                            onKeyDown={(e) => handleKeyDown(e, setOcrTranslate, setDtOcrTranslate)}
                            onFocus={() => handleFocus(ocrTranslate, setOcrTranslate, setDtOcrTranslate)}
                            endContent={
                                (ocrTranslate !== '' || dtOcrTranslate !== '') && (
                                    <Button size='sm' variant='flat'
                                        onPress={() => confirmHandler('hotkey_ocr_translate', ocrTranslate, dtOcrTranslate)}
                                    >{t('common.ok')}</Button>
                                )
                            }
                        />
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto'>{t('config.hotkey.light_ai')}</h3>
                    {lightAi !== null && (
                        <Input
                            type='hotkey'
                            variant='bordered'
                            value={displayVal(lightAi, dtLightAi)}
                            label={t('config.hotkey.set_hotkey')}
                            className='max-w-[50%]'
                            onKeyDown={(e) => handleKeyDown(e, setLightAi, setDtLightAi)}
                            onFocus={() => handleFocus(lightAi, setLightAi, setDtLightAi)}
                            endContent={
                                (lightAi !== '' || dtLightAi !== '') && (
                                    <Button size='sm' variant='flat'
                                        onPress={() => confirmHandler('hotkey_light_ai', lightAi, dtLightAi)}
                                    >{t('common.ok')}</Button>
                                )
                            }
                        />
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto'>{t('config.hotkey.vault_quick_add')}</h3>
                    {vaultQuickAdd !== null && (
                        <Input
                            type='hotkey'
                            variant='bordered'
                            value={displayVal(vaultQuickAdd, dtVaultQuickAdd)}
                            label={t('config.hotkey.set_hotkey')}
                            className='max-w-[50%]'
                            onKeyDown={(e) => handleKeyDown(e, setVaultQuickAdd, setDtVaultQuickAdd)}
                            onFocus={() => handleFocus(vaultQuickAdd, setVaultQuickAdd, setDtVaultQuickAdd)}
                            endContent={
                                (vaultQuickAdd !== '' || dtVaultQuickAdd !== '') && (
                                    <Button size='sm' variant='flat'
                                        onPress={() => confirmHandler('hotkey_vault_quick_add', vaultQuickAdd, dtVaultQuickAdd)}
                                    >{t('common.ok')}</Button>
                                )
                            }
                        />
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto'>{t('config.hotkey.vault_quick_fill')}</h3>
                    {vaultQuickFill !== null && (
                        <Input
                            type='hotkey'
                            variant='bordered'
                            value={displayVal(vaultQuickFill, dtVaultQuickFill)}
                            label={t('config.hotkey.set_hotkey')}
                            className='max-w-[50%]'
                            onKeyDown={(e) => handleKeyDown(e, setVaultQuickFill, setDtVaultQuickFill)}
                            onFocus={() => handleFocus(vaultQuickFill, setVaultQuickFill, setDtVaultQuickFill)}
                            endContent={
                                (vaultQuickFill !== '' || dtVaultQuickFill !== '') && (
                                    <Button size='sm' variant='flat'
                                        onPress={() => confirmHandler('hotkey_vault_quick_fill', vaultQuickFill, dtVaultQuickFill)}
                                    >{t('common.ok')}</Button>
                                )
                            }
                        />
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto'>{t('config.hotkey.phrases')}</h3>
                    {phrases !== null && (
                        <Input
                            type='hotkey'
                            variant='bordered'
                            value={displayVal(phrases, dtPhrases)}
                            label={t('config.hotkey.set_hotkey')}
                            className='max-w-[50%]'
                            onKeyDown={(e) => handleKeyDown(e, setPhrases, setDtPhrases)}
                            onFocus={() => handleFocus(phrases, setPhrases, setDtPhrases)}
                            endContent={
                                (phrases !== '' || dtPhrases !== '') && (
                                    <Button size='sm' variant='flat'
                                        onPress={() => confirmHandler('hotkey_phrases', phrases, dtPhrases)}
                                    >{t('common.ok')}</Button>
                                )
                            }
                        />
                    )}
                </div>
            </CardBody>
        </Card>
    );
}
