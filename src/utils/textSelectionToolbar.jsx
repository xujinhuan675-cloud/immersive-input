import {
    LuCalculator,
    LuFileSearch,
    LuFolderOpen,
    LuGripVertical,
    LuLanguages,
    LuLink,
    LuMail,
    LuPalette,
    LuSparkles,
    LuTextCursorInput,
} from 'react-icons/lu';

export const BASE_TOOLBAR_BUTTONS = [
    {
        id: 'translate',
        cfgKey: 'toolbar_btn_translate',
        labelKey: 'config.text_selection.btn_translate',
        fallbackLabel: 'Translate',
        Icon: LuLanguages,
    },
    {
        id: 'explain',
        cfgKey: 'toolbar_btn_explain',
        labelKey: 'config.text_selection.btn_explain',
        fallbackLabel: 'Explain',
        Icon: LuFileSearch,
    },
    {
        id: 'format',
        cfgKey: 'toolbar_btn_format',
        labelKey: 'config.text_selection.btn_format',
        fallbackLabel: 'Format',
        Icon: LuTextCursorInput,
    },
    {
        id: 'lightai',
        cfgKey: 'toolbar_btn_lightai',
        labelKey: 'config.text_selection.btn_lightai',
        fallbackLabel: 'AI',
        Icon: LuSparkles,
    },
];

export const SMART_TOOLBAR_BUTTONS = [
    {
        type: 'url',
        id: 'open_url',
        labelKey: 'config.text_selection.smart.url.title',
        fallbackLabel: '\u6253\u5f00\u94fe\u63a5',
        matchLabelKey: 'config.text_selection.smart.url.match',
        matchFallback: '\u9009\u4e2d URL \u6216\u57df\u540d\u65f6\u81ea\u52a8\u51fa\u73b0',
        example: 'https://example.com',
        Icon: LuLink,
        tone: 'accent',
    },
    {
        type: 'email',
        id: 'send_email',
        labelKey: 'config.text_selection.smart.email.title',
        fallbackLabel: '\u53d1\u9001\u90ae\u4ef6',
        matchLabelKey: 'config.text_selection.smart.email.match',
        matchFallback: '\u9009\u4e2d\u90ae\u7bb1\u5730\u5740\u65f6\u81ea\u52a8\u51fa\u73b0',
        example: 'hello@example.com',
        Icon: LuMail,
        tone: 'accent',
    },
    {
        type: 'filepath',
        id: 'open_path',
        labelKey: 'config.text_selection.smart.filepath.title',
        fallbackLabel: '\u6253\u5f00\u8def\u5f84',
        matchLabelKey: 'config.text_selection.smart.filepath.match',
        matchFallback: '\u9009\u4e2d\u6587\u4ef6\u6216\u6587\u4ef6\u5939\u8def\u5f84\u65f6\u81ea\u52a8\u51fa\u73b0',
        example: 'C:\\Users\\me\\Desktop\\note.txt',
        Icon: LuFolderOpen,
        tone: 'accent',
    },
    {
        type: 'number',
        id: 'calculate',
        labelKey: 'config.text_selection.smart.number.title',
        fallbackLabel: '\u8ba1\u7b97',
        matchLabelKey: 'config.text_selection.smart.number.match',
        matchFallback: '\u9009\u4e2d\u7b97\u5f0f\u6216\u6570\u503c\u65f6\u81ea\u52a8\u51fa\u73b0',
        example: '12 * (8 + 3)',
        Icon: LuCalculator,
        tone: 'accent',
    },
    {
        type: 'color',
        id: 'show_color',
        labelKey: 'config.text_selection.smart.color.title',
        fallbackLabel: '\u989c\u8272\u9884\u89c8',
        matchLabelKey: 'config.text_selection.smart.color.match',
        matchFallback: '\u9009\u4e2d HEX \u989c\u8272\u503c\u65f6\u81ea\u52a8\u51fa\u73b0',
        example: '#3B82F6',
        Icon: LuPalette,
        tone: 'accent',
    },
];

export const SMART_TOOLBAR_BUTTON_MAP = SMART_TOOLBAR_BUTTONS.reduce(
    (result, button) => {
        result[button.type] = button;
        return result;
    },
    {}
);

export const TOOLBAR_DRAG_ICON = LuGripVertical;

export function getToolbarButtonLabel(button, t) {
    if (button?.labelKey && typeof t === 'function') {
        const translated = t(button.labelKey, {
            defaultValue: button.fallbackLabel,
        });
        if (translated && translated !== button.labelKey) {
            return translated;
        }
    }

    return button?.fallbackLabel ?? button?.label ?? button?.id ?? '';
}

export function getToolbarButtonMatchLabel(button, t) {
    if (button?.matchLabelKey && typeof t === 'function') {
        const translated = t(button.matchLabelKey, {
            defaultValue: button.matchFallback,
        });
        if (translated && translated !== button.matchLabelKey) {
            return translated;
        }
    }

    return button?.matchFallback ?? '';
}
