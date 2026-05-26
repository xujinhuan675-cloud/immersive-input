import { unregister, isRegistered } from '@tauri-apps/api/globalShortcut';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@nextui-org/react';
import React, { useState } from 'react';

import { useConfig } from '../../../../hooks/useConfig';
import { useToastStyle } from '../../../../hooks';
import { osType } from '../../../../utils/env';
import { invoke } from '@tauri-apps/api';

// Maps browser KeyboardEvent.code to the rdev Key Debug string stored in config.
// rdev uses format!("{:?}", key) so the strings must match exactly.
const BROWSER_TO_RDEV = {
    // Modifier keys
    AltLeft: 'Alt',
    AltRight: 'Alt',
    ControlLeft: 'ControlLeft',
    ControlRight: 'ControlRight',
    ShiftLeft: 'ShiftLeft',
    ShiftRight: 'ShiftRight',
    MetaLeft: 'MetaLeft',
    MetaRight: 'MetaRight',
    // Whitespace / navigation
    Space: 'Space',
    Tab: 'Tab',
    Escape: 'Escape',
    CapsLock: 'CapsLock',
    Backspace: 'Backspace',
    Enter: 'Return',
    Insert: 'Insert',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'UpArrow',
    ArrowDown: 'DownArrow',
    ArrowLeft: 'LeftArrow',
    ArrowRight: 'RightArrow',
    // Symbol keys
    Backquote: 'BackQuote',
    Minus: 'Minus',
    Equal: 'Equal',
    BracketLeft: 'LeftBracket',
    BracketRight: 'RightBracket',
    Semicolon: 'SemiColon',
    Quote: 'Quote',
    Backslash: 'BackSlash',
    Comma: 'Comma',
    Period: 'Dot',
    Slash: 'Slash',
    // Letter keys
    KeyA: 'KeyA',
    KeyB: 'KeyB',
    KeyC: 'KeyC',
    KeyD: 'KeyD',
    KeyE: 'KeyE',
    KeyF: 'KeyF',
    KeyG: 'KeyG',
    KeyH: 'KeyH',
    KeyI: 'KeyI',
    KeyJ: 'KeyJ',
    KeyK: 'KeyK',
    KeyL: 'KeyL',
    KeyM: 'KeyM',
    KeyN: 'KeyN',
    KeyO: 'KeyO',
    KeyP: 'KeyP',
    KeyQ: 'KeyQ',
    KeyR: 'KeyR',
    KeyS: 'KeyS',
    KeyT: 'KeyT',
    KeyU: 'KeyU',
    KeyV: 'KeyV',
    KeyW: 'KeyW',
    KeyX: 'KeyX',
    KeyY: 'KeyY',
    KeyZ: 'KeyZ',
    // Digit keys (browser uses Digit prefix, rdev uses Num prefix)
    Digit1: 'Num1',
    Digit2: 'Num2',
    Digit3: 'Num3',
    Digit4: 'Num4',
    Digit5: 'Num5',
    Digit6: 'Num6',
    Digit7: 'Num7',
    Digit8: 'Num8',
    Digit9: 'Num9',
    Digit0: 'Num0',
    // Function keys
    F1: 'F1',
    F2: 'F2',
    F3: 'F3',
    F4: 'F4',
    F5: 'F5',
    F6: 'F6',
    F7: 'F7',
    F8: 'F8',
    F9: 'F9',
    F10: 'F10',
    F11: 'F11',
    F12: 'F12',
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

const HOTKEY_INPUT_CLASS_NAMES = {
    inputWrapper:
        'h-10 rounded-lg border-default-200/90 bg-content1 px-3 shadow-none group-data-[focus=true]:border-primary-400',
    input: 'text-[14px] font-medium text-foreground',
};

function HotkeyRow(props) {
    const {
        label,
        combo,
        doubleTap,
        setCombo,
        setDoubleTap,
        configKey,
        displayVal,
        handleKeyDown,
        handleFocus,
        confirmHandler,
        t,
    } = props;
    const [dirty, setDirty] = useState(false);
    const handleSave = async () => {
        const saved = await confirmHandler(configKey, combo, doubleTap);
        if (saved) {
            setDirty(false);
        }
    };

    return (
        <div className='flex min-h-[64px] items-center justify-between gap-5 border-b border-default-100 px-5 py-3 last:border-b-0'>
            <h3 className='text-[14px] font-medium text-foreground'>{label}</h3>
            <Input
                type='hotkey'
                variant='bordered'
                value={displayVal(combo, doubleTap)}
                placeholder={t('config.hotkey.set_hotkey')}
                className='w-full max-w-[360px] shrink-0'
                classNames={HOTKEY_INPUT_CLASS_NAMES}
                onKeyDown={(event) => {
                    handleKeyDown(event, setCombo, setDoubleTap);
                    setDirty(true);
                }}
                onFocus={() => {
                    handleFocus(combo, setCombo, setDoubleTap);
                    setDirty(false);
                }}
                endContent={
                    dirty ? (
                        <Button
                            size='sm'
                            variant='flat'
                            className='h-7 min-w-[52px] rounded-md bg-default-100 px-2 text-[12px] font-medium text-default-700 hover:bg-primary-50 hover:text-primary'
                            onPress={handleSave}
                        >
                            {t('common.save')}
                        </Button>
                    ) : null
                }
            />
        </div>
    );
}

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
        if (e.metaKey)
            newValue = `${newValue}${newValue.length > 0 ? '+' : ''}${osType === 'Darwin' ? 'Command' : 'Super'}`;
        if (e.altKey) newValue = `${newValue}${newValue.length > 0 ? '+' : ''}Alt`;
        let code = e.code;
        if (code.startsWith('Key')) code = code.substring(3);
        else if (code.startsWith('Digit')) code = code.substring(5);
        else if (code.startsWith('Numpad')) code = 'Num' + code.substring(6);
        else if (code.startsWith('Arrow')) code = code.substring(5);
        else if (code.startsWith('Intl')) code = code.substring(4);
        else if (/F\d+/.test(code)) {
            /* keep as-is */
        } else if (keyMap[code] !== undefined) code = keyMap[code];
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
            if (_pending.key === rdevKey && _pending.time && now - _pending.time < 300) {
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

    // rdev key string → human-readable display symbol
    const RDEV_DISPLAY = {
        // Letters
        KeyA: 'A',
        KeyB: 'B',
        KeyC: 'C',
        KeyD: 'D',
        KeyE: 'E',
        KeyF: 'F',
        KeyG: 'G',
        KeyH: 'H',
        KeyI: 'I',
        KeyJ: 'J',
        KeyK: 'K',
        KeyL: 'L',
        KeyM: 'M',
        KeyN: 'N',
        KeyO: 'O',
        KeyP: 'P',
        KeyQ: 'Q',
        KeyR: 'R',
        KeyS: 'S',
        KeyT: 'T',
        KeyU: 'U',
        KeyV: 'V',
        KeyW: 'W',
        KeyX: 'X',
        KeyY: 'Y',
        KeyZ: 'Z',
        // Digits
        Num0: '0',
        Num1: '1',
        Num2: '2',
        Num3: '3',
        Num4: '4',
        Num5: '5',
        Num6: '6',
        Num7: '7',
        Num8: '8',
        Num9: '9',
        // Symbols
        SemiColon: ';',
        Quote: "'",
        Comma: ',',
        Dot: '.',
        Slash: '/',
        BackQuote: '`',
        Minus: '-',
        Equal: '=',
        LeftBracket: '[',
        RightBracket: ']',
        BackSlash: '\\',
        // Special
        Space: '\u23B5', // ⎵ spacebar symbol
    };

    // Display value for the unified input: combo takes priority, then doubletap.
    function displayVal(combo, dt) {
        if (combo) return combo;
        if (dt) {
            const sym = RDEV_DISPLAY[dt] || dt;
            return `${sym}${sym}`;
        }
        return '';
    }

    // Confirm handler: combo needs OS registration; doubletap is already saved, just toast.
    async function confirmHandler(hotkeyName, combo, dt) {
        if (combo !== '') {
            return registerHandler(hotkeyName, combo);
        } else if (dt !== '') {
            toast.success(t('config.hotkey.success'), { style: toastStyle });
            return true;
        }
        return false;
    }

    function registerHandler(name, key) {
        return isRegistered(key).then((res) => {
            if (res) {
                toast.error(t('config.hotkey.is_register'), { style: toastStyle });
                return false;
            } else {
                return invoke('register_shortcut_by_frontend', {
                    name: name,
                    shortcut: key,
                }).then(
                    () => {
                        toast.success(t('config.hotkey.success'), { style: toastStyle });
                        return true;
                    },
                    (e) => {
                        toast.error(e, { style: toastStyle });
                        return false;
                    }
                );
            }
        });
    }

    const hotkeyRows = [
        {
            label: t('config.hotkey.selection_translate'),
            configKey: 'hotkey_selection_translate',
            combo: selectionTranslate,
            doubleTap: dtSelectionTranslate,
            setCombo: setSelectionTranslate,
            setDoubleTap: setDtSelectionTranslate,
        },
        {
            label: t('config.hotkey.input_translate'),
            configKey: 'hotkey_input_translate',
            combo: inputTranslate,
            doubleTap: dtInputTranslate,
            setCombo: setInputTranslate,
            setDoubleTap: setDtInputTranslate,
        },
        {
            label: t('config.hotkey.ocr_recognize'),
            configKey: 'hotkey_ocr_recognize',
            combo: ocrRecognize,
            doubleTap: dtOcrRecognize,
            setCombo: setOcrRecognize,
            setDoubleTap: setDtOcrRecognize,
        },
        {
            label: t('config.hotkey.ocr_translate'),
            configKey: 'hotkey_ocr_translate',
            combo: ocrTranslate,
            doubleTap: dtOcrTranslate,
            setCombo: setOcrTranslate,
            setDoubleTap: setDtOcrTranslate,
        },
        {
            label: t('config.hotkey.light_ai'),
            configKey: 'hotkey_light_ai',
            combo: lightAi,
            doubleTap: dtLightAi,
            setCombo: setLightAi,
            setDoubleTap: setDtLightAi,
        },
        {
            label: t('config.hotkey.vault_quick_add'),
            configKey: 'hotkey_vault_quick_add',
            combo: vaultQuickAdd,
            doubleTap: dtVaultQuickAdd,
            setCombo: setVaultQuickAdd,
            setDoubleTap: setDtVaultQuickAdd,
        },
        {
            label: t('config.hotkey.vault_quick_fill'),
            configKey: 'hotkey_vault_quick_fill',
            combo: vaultQuickFill,
            doubleTap: dtVaultQuickFill,
            setCombo: setVaultQuickFill,
            setDoubleTap: setDtVaultQuickFill,
        },
        {
            label: t('config.hotkey.phrases'),
            configKey: 'hotkey_phrases',
            combo: phrases,
            doubleTap: dtPhrases,
            setCombo: setPhrases,
            setDoubleTap: setDtPhrases,
        },
    ];

    return (
        <section className='overflow-hidden rounded-xl border border-default-200/80 bg-content1'>
            <Toaster />
            {hotkeyRows
                .filter((row) => row.combo !== null)
                .map((row) => (
                    <HotkeyRow
                        key={row.configKey}
                        {...row}
                        displayVal={displayVal}
                        handleKeyDown={handleKeyDown}
                        handleFocus={handleFocus}
                        confirmHandler={confirmHandler}
                        t={t}
                    />
                ))}
        </section>
    );
}
