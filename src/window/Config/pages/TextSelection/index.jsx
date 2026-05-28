import {
    Button,
    DropdownItem,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Switch,
    useDisclosure,
} from '@nextui-org/react';
import { invoke } from '@tauri-apps/api';
import React, { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { useTranslation } from 'react-i18next';
import { MdKeyboardArrowDown } from 'react-icons/md';

import { SettingsRow, SettingsSection } from '../../../../components/SettingsSection';
import SettingsDropdown from '../../../../components/SettingsDropdown';
import { useConfig } from '../../../../hooks/useConfig';
import {
    DEFAULT_FORMATTER_CONFIG,
    FORMATTER_CONFIG_KEY,
    formatText,
    getMergedFormatterConfig,
} from '../../../../utils/formatter';
import {
    BASE_TOOLBAR_BUTTONS,
    DEFAULT_SMART_TOOLBAR_CONFIG,
    getToolbarButtonMatchLabel,
    getToolbarButtonLabel,
    SMART_TOOLBAR_BUTTONS,
    SMART_TOOLBAR_CONFIG_KEY,
    TOOLBAR_BUTTON_ACTION_BEHAVIORS,
} from '../../../../utils/textSelectionToolbar';
import { ConfigServiceIconButton, ConfigServiceListRow } from '../Service/AIConfig/ServiceItem/ServiceRow';

const DEFAULT_BTN_ORDER = ['translate', 'explain', 'format', 'lightai'];
const FORMATTER_PREVIEW_INPUT = 'Hello   world\n这是 一段  文字 , with odd spacing .\n\nCopied line\nbreaks';

function getLocalizedDefaultValue(isChineseUI, zhText, enText) {
    return isChineseUI ? zhText : enText;
}

function getFormatterRuleOptions(isChineseUI) {
    return [
        {
            key: 'normalizeWhitespace',
            title: getLocalizedDefaultValue(isChineseUI, '清理多余空格', 'Clean Extra Spaces'),
            description: getLocalizedDefaultValue(
                isChineseUI,
                '统一制表符、全角空格和连续空格，并清理行首行尾空白。',
                'Normalize tabs, full-width spaces, repeated spaces, and line-edge whitespace.'
            ),
        },
        {
            key: 'repairLineBreaks',
            title: getLocalizedDefaultValue(isChineseUI, '修复复制断行', 'Repair Wrapped Lines'),
            description: getLocalizedDefaultValue(
                isChineseUI,
                '合并从 PDF、网页或邮件中复制出来的意外换行，保留空行和列表结构。',
                'Merge accidental line wraps copied from PDFs, web pages, or email while preserving lists and blank lines.'
            ),
        },
        {
            key: 'cjkSpacing',
            title: getLocalizedDefaultValue(isChineseUI, '中英文间距', 'CJK Spacing'),
            description: getLocalizedDefaultValue(
                isChineseUI,
                '在中文与英文、数字、括号之间补上自然间距。',
                'Add natural spacing between Chinese text and Latin letters, numbers, or brackets.'
            ),
        },
        {
            key: 'capitalizeAtCjkBoundary',
            title: getLocalizedDefaultValue(isChineseUI, '边界首字母大写', 'Boundary Capitalization'),
            description: getLocalizedDefaultValue(
                isChineseUI,
                '中英文混排时，将相邻英文片段的首个小写字母转为大写。',
                'Capitalize the first lowercase letter in Latin fragments next to CJK text.'
            ),
        },
        {
            key: 'normalizePunctuation',
            title: getLocalizedDefaultValue(isChineseUI, '标点规范化', 'Normalize Punctuation'),
            description: getLocalizedDefaultValue(
                isChineseUI,
                '根据前文语境在中文全角标点和英文半角标点之间自动切换。',
                'Choose Chinese full-width or English half-width punctuation based on nearby text.'
            ),
        },
        {
            key: 'normalizeAbbreviations',
            title: getLocalizedDefaultValue(isChineseUI, '常见缩写大写', 'Uppercase Abbreviations'),
            description: getLocalizedDefaultValue(
                isChineseUI,
                '自动规范 AI、API、URL、JSON 等常见技术缩写。',
                'Normalize common technical abbreviations such as AI, API, URL, and JSON.'
            ),
        },
        {
            key: 'cleanupSpaces',
            title: getLocalizedDefaultValue(isChineseUI, '清理标点空格', 'Clean Punctuation Spaces'),
            description: getLocalizedDefaultValue(
                isChineseUI,
                '移除标点前多余空格，并补齐英文标点后的必要空格。',
                'Remove extra spaces before punctuation and add expected spaces after English punctuation.'
            ),
        },
    ];
}

function getFormatterSummary(formatterConfig, isChineseUI) {
    const mergedConfig = getMergedFormatterConfig(formatterConfig);
    const enabledRules = getFormatterRuleOptions(isChineseUI).filter((option) => mergedConfig[option.key]);

    if (enabledRules.length === 0) {
        return getLocalizedDefaultValue(
            isChineseUI,
            '点击后按原文回填；可进入编辑选择格式化规则。',
            'Apply the original text; open settings to choose formatting rules.'
        );
    }

    const ruleNames = enabledRules
        .slice(0, 3)
        .map((option) => option.title)
        .join(getLocalizedDefaultValue(isChineseUI, '、', ', '));
    const suffix =
        enabledRules.length > 3
            ? getLocalizedDefaultValue(isChineseUI, `等 ${enabledRules.length} 项`, ` and ${enabledRules.length - 3} more`)
            : '';

    return getLocalizedDefaultValue(
        isChineseUI,
        `点击后直接整理选中文本并回填：${ruleNames}${suffix}。`,
        `Format and apply selected text: ${ruleNames}${suffix}.`
    );
}

function getButtonActionOptions(button, t, isChineseUI) {
    const options = [
        {
            key: TOOLBAR_BUTTON_ACTION_BEHAVIORS.WINDOW,
            label: t('config.text_selection.lightai_action_window', {
                defaultValue: getLocalizedDefaultValue(isChineseUI, '打开窗口', 'Open Window'),
            }),
            description: getLocalizedDefaultValue(
                isChineseUI,
                '点击后打开对应窗口，查看结果后再手动处理。',
                'Open the related window so you can review the result before applying it.'
            ),
        },
        {
            key: TOOLBAR_BUTTON_ACTION_BEHAVIORS.APPLY,
            label: t('config.text_selection.lightai_action_apply', {
                defaultValue: getLocalizedDefaultValue(isChineseUI, '直接应用结果', 'Direct Apply'),
            }),
            description: getLocalizedDefaultValue(
                isChineseUI,
                '点击后直接生成结果并回填到原文，不再先弹出窗口。',
                'Generate the result and write it back immediately without opening a window first.'
            ),
        },
    ];

    if (button?.actionBehaviorKey) {
        options.push({
            key: TOOLBAR_BUTTON_ACTION_BEHAVIORS.STREAM_APPLY,
            label: t('config.text_selection.lightai_action_stream_apply', {
                defaultValue: getLocalizedDefaultValue(isChineseUI, '流式输入结果', 'Stream Input Result'),
            }),
            description: getLocalizedDefaultValue(
                isChineseUI,
                '在原光标位置边生成边输入，像实时打字一样替换选中文本。',
                'Stream the generated text into the current cursor position, replacing the selection as it arrives.'
            ),
        });
    }

    return options;
}

function getButtonActionSummary(button, actionBehavior, t, isChineseUI) {
    const options = getButtonActionOptions(button, t, isChineseUI);
    return options.find((option) => option.key === actionBehavior)?.description ?? options[0].description;
}

function ToolbarButtonActionModal(props) {
    const { button, label, actionBehavior, setActionBehavior, t, isChineseUI } = props;
    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const [draftBehavior, setDraftBehavior] = useState(actionBehavior ?? TOOLBAR_BUTTON_ACTION_BEHAVIORS.WINDOW);
    const Icon = button.Icon;
    const options = useMemo(() => getButtonActionOptions(button, t, isChineseUI), [button, t, isChineseUI]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setDraftBehavior(actionBehavior ?? TOOLBAR_BUTTON_ACTION_BEHAVIORS.WINDOW);
    }, [actionBehavior, isOpen]);

    return (
        <>
            <ConfigServiceIconButton
                className='h-8 w-8 min-w-8 rounded-md'
                onPress={onOpen}
            >
                <MdKeyboardArrowDown className='rotate-[-90deg] text-[20px]' />
            </ConfigServiceIconButton>

            <Modal
                isOpen={isOpen}
                onOpenChange={onOpenChange}
                scrollBehavior='inside'
            >
                <ModalContent className='max-h-[80vh]'>
                    {(onClose) => (
                        <>
                            <ModalHeader>
                                <div className='flex items-center gap-3'>
                                    <div className='flex h-[28px] w-[28px] items-center justify-center rounded-[10px] bg-primary-100 text-primary'>
                                        <Icon size={16} />
                                    </div>
                                    <div className='flex flex-col'>
                                        <span className='text-sm font-semibold text-foreground'>{label}</span>
                                        <span className='text-xs font-normal text-default-400'>
                                            {getLocalizedDefaultValue(
                                                isChineseUI,
                                                '选择点击该按钮后的行为',
                                                'Choose what happens after clicking this button'
                                            )}
                                        </span>
                                    </div>
                                </div>
                            </ModalHeader>

                            <ModalBody>
                                <div className='space-y-3 pb-2'>
                                    {options.map((option) => {
                                        const selected = draftBehavior === option.key;

                                        return (
                                            <button
                                                key={option.key}
                                                type='button'
                                                className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                                                    selected
                                                        ? 'border-primary bg-primary/5'
                                                        : 'border-default-200 bg-default-50/50 hover:border-default-300 hover:bg-default-100/70'
                                                }`}
                                                onClick={() => {
                                                    setDraftBehavior(option.key);
                                                }}
                                            >
                                                <div className='flex items-start gap-3'>
                                                    <div
                                                        className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                                                            selected
                                                                ? 'border-primary bg-primary'
                                                                : 'border-default-300 bg-white'
                                                        }`}
                                                        aria-hidden='true'
                                                    >
                                                        {selected ? (
                                                            <div className='h-2 w-2 rounded-full bg-white' />
                                                        ) : null}
                                                    </div>
                                                    <div className='min-w-0 flex-1'>
                                                        <div className='text-sm font-semibold text-foreground'>
                                                            {option.label}
                                                        </div>
                                                        <div className='mt-1 text-xs leading-5 text-default-500'>
                                                            {option.description}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </ModalBody>

                            <ModalFooter>
                                <Button
                                    variant='light'
                                    onPress={onClose}
                                >
                                    {t('common.cancel', {
                                        defaultValue: getLocalizedDefaultValue(isChineseUI, '取消', 'Cancel'),
                                    })}
                                </Button>
                                <Button
                                    color='primary'
                                    onPress={() => {
                                        setActionBehavior(draftBehavior);
                                        onClose();
                                    }}
                                >
                                    {t('common.save', {
                                        defaultValue: getLocalizedDefaultValue(isChineseUI, '保存', 'Save'),
                                    })}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </>
    );
}

function ConfigurableToolbarButtonRow(props) {
    const { button, label, dragHandleProps, t, isChineseUI } = props;
    const [enabled, setEnabled] = useConfig(button.cfgKey, true);
    const [actionBehavior, setActionBehavior] = useConfig(
        button.actionBehaviorKey,
        TOOLBAR_BUTTON_ACTION_BEHAVIORS.WINDOW
    );
    const Icon = button.Icon;

    return (
        <ConfigServiceListRow
            dragHandleProps={dragHandleProps}
            variant='list'
            icon={<Icon size={18} />}
            title={label}
            description={getButtonActionSummary(button, actionBehavior, t, isChineseUI)}
            actions={
                <>
                    <Switch
                        size='sm'
                        isSelected={enabled ?? true}
                        onValueChange={setEnabled}
                    />
                    <ToolbarButtonActionModal
                        button={button}
                        label={label}
                        actionBehavior={actionBehavior}
                        setActionBehavior={setActionBehavior}
                        t={t}
                        isChineseUI={isChineseUI}
                    />
                </>
            }
        />
    );
}

function FormatButtonConfigModal(props) {
    const { button, label, formatterConfig, setFormatterConfig, t, isChineseUI } = props;
    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const [draftConfig, setDraftConfig] = useState(getMergedFormatterConfig(formatterConfig));
    const Icon = button.Icon;
    const ruleOptions = useMemo(() => getFormatterRuleOptions(isChineseUI), [isChineseUI]);
    const previewOutput = useMemo(() => formatText(FORMATTER_PREVIEW_INPUT, draftConfig), [draftConfig]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setDraftConfig(getMergedFormatterConfig(formatterConfig));
    }, [formatterConfig, isOpen]);

    return (
        <>
            <ConfigServiceIconButton
                className='h-8 w-8 min-w-8 rounded-md'
                onPress={onOpen}
            >
                <MdKeyboardArrowDown className='rotate-[-90deg] text-[20px]' />
            </ConfigServiceIconButton>

            <Modal
                isOpen={isOpen}
                onOpenChange={onOpenChange}
                scrollBehavior='inside'
            >
                <ModalContent className='max-h-[82vh]'>
                    {(onClose) => (
                        <>
                            <ModalHeader>
                                <div className='flex items-center gap-3'>
                                    <div className='flex h-[28px] w-[28px] items-center justify-center rounded-[10px] bg-primary-100 text-primary'>
                                        <Icon size={16} />
                                    </div>
                                    <div className='flex flex-col'>
                                        <span className='text-sm font-semibold text-foreground'>{label}</span>
                                        <span className='text-xs font-normal text-default-400'>
                                            {getLocalizedDefaultValue(
                                                isChineseUI,
                                                '选择格式化时启用的文本整理规则',
                                                'Choose the cleanup rules used by Format'
                                            )}
                                        </span>
                                    </div>
                                </div>
                            </ModalHeader>

                            <ModalBody>
                                <div className='space-y-3 pb-2'>
                                    {ruleOptions.map((option) => (
                                        <div
                                            key={option.key}
                                            className='rounded-lg border border-default-200 bg-default-50/50 px-4 py-3'
                                        >
                                            <Switch
                                                size='sm'
                                                isSelected={Boolean(draftConfig[option.key])}
                                                onValueChange={(value) => {
                                                    setDraftConfig((currentConfig) => ({
                                                        ...getMergedFormatterConfig(currentConfig),
                                                        [option.key]: value,
                                                    }));
                                                }}
                                                classNames={{
                                                    base: 'flex w-full max-w-full flex-row-reverse justify-between gap-4',
                                                    label: 'min-w-0',
                                                }}
                                            >
                                                <div className='min-w-0'>
                                                    <div className='text-sm font-semibold text-foreground'>
                                                        {option.title}
                                                    </div>
                                                    <div className='mt-1 text-xs leading-5 text-default-500'>
                                                        {option.description}
                                                    </div>
                                                </div>
                                            </Switch>
                                        </div>
                                    ))}

                                    <div className='rounded-lg border border-default-200 bg-content1 p-3'>
                                        <div className='mb-2 text-xs font-semibold text-default-500'>
                                            {getLocalizedDefaultValue(isChineseUI, '预览', 'Preview')}
                                        </div>
                                        <div className='grid gap-3 sm:grid-cols-2'>
                                            <div>
                                                <div className='mb-1 text-[11px] font-medium text-default-400'>
                                                    {getLocalizedDefaultValue(isChineseUI, '原文', 'Input')}
                                                </div>
                                                <pre className='max-h-[132px] overflow-auto whitespace-pre-wrap rounded-md bg-default-50 p-2 text-[11px] leading-5 text-default-600'>
                                                    {FORMATTER_PREVIEW_INPUT}
                                                </pre>
                                            </div>
                                            <div>
                                                <div className='mb-1 text-[11px] font-medium text-default-400'>
                                                    {getLocalizedDefaultValue(isChineseUI, '结果', 'Result')}
                                                </div>
                                                <pre className='max-h-[132px] overflow-auto whitespace-pre-wrap rounded-md bg-default-50 p-2 text-[11px] leading-5 text-default-600'>
                                                    {previewOutput}
                                                </pre>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </ModalBody>

                            <ModalFooter>
                                <Button
                                    variant='light'
                                    onPress={() => {
                                        setDraftConfig({ ...DEFAULT_FORMATTER_CONFIG });
                                    }}
                                >
                                    {getLocalizedDefaultValue(isChineseUI, '恢复默认', 'Restore Defaults')}
                                </Button>
                                <Button
                                    variant='light'
                                    onPress={onClose}
                                >
                                    {t('common.cancel', {
                                        defaultValue: getLocalizedDefaultValue(isChineseUI, '取消', 'Cancel'),
                                    })}
                                </Button>
                                <Button
                                    color='primary'
                                    onPress={() => {
                                        setFormatterConfig(getMergedFormatterConfig(draftConfig));
                                        onClose();
                                    }}
                                >
                                    {t('common.save', {
                                        defaultValue: getLocalizedDefaultValue(isChineseUI, '保存', 'Save'),
                                    })}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </>
    );
}

function FormatToolbarButtonRow(props) {
    const { button, label, dragHandleProps, t, isChineseUI } = props;
    const [enabled, setEnabled] = useConfig(button.cfgKey, true);
    const [formatterConfig, setFormatterConfig] = useConfig(FORMATTER_CONFIG_KEY, DEFAULT_FORMATTER_CONFIG);
    const Icon = button.Icon;

    return (
        <ConfigServiceListRow
            dragHandleProps={dragHandleProps}
            variant='list'
            icon={<Icon size={18} />}
            title={label}
            description={getFormatterSummary(formatterConfig, isChineseUI)}
            actions={
                <>
                    <Switch
                        size='sm'
                        isSelected={enabled ?? true}
                        onValueChange={setEnabled}
                    />
                    <FormatButtonConfigModal
                        button={button}
                        label={label}
                        formatterConfig={formatterConfig}
                        setFormatterConfig={setFormatterConfig}
                        t={t}
                        isChineseUI={isChineseUI}
                    />
                </>
            }
        />
    );
}

function SmartCapabilityRow(props) {
    const { button, smartConfig, setSmartConfig, isChineseUI } = props;
    const Icon = button.Icon;
    const enabled = smartConfig?.[button.id] !== false;
    const description = button.example
        ? getLocalizedDefaultValue(
              isChineseUI,
              `${button.matchLabel}，例如 ${button.example}`,
              `${button.matchLabel}, e.g. ${button.example}`
          )
        : button.matchLabel;

    return (
        <ConfigServiceListRow
            variant='list'
            showDragHandle={false}
            icon={<Icon size={18} />}
            title={button.label}
            description={description}
            actions={
                <>
                    <Switch
                        size='sm'
                        isSelected={enabled}
                        onValueChange={(value) => {
                            setSmartConfig({
                                ...DEFAULT_SMART_TOOLBAR_CONFIG,
                                ...(smartConfig ?? {}),
                                [button.id]: value,
                            });
                        }}
                    />
                    <div className='h-8 w-8 min-w-8 shrink-0' aria-hidden='true' />
                </>
            }
        />
    );
}

function ToolbarButtonItem(props) {
    const { button } = props;

    if (button.id === 'format') {
        return <FormatToolbarButtonRow {...props} />;
    }

    if (button.actionBehaviorKey) {
        return <ConfigurableToolbarButtonRow {...props} />;
    }

    return null;
}

export default function TextSelection() {
    const { t, i18n } = useTranslation();
    const [behavior, setBehavior] = useConfig('text_select_behavior', 'toolbar');
    const [btnOrder, setBtnOrder] = useConfig('toolbar_btn_order', DEFAULT_BTN_ORDER);
    const [smartConfig, setSmartConfig] = useConfig(SMART_TOOLBAR_CONFIG_KEY, DEFAULT_SMART_TOOLBAR_CONFIG);
    const isChineseUI = String(i18n?.resolvedLanguage || i18n?.language || '')
        .toLowerCase()
        .startsWith('zh');

    const behaviorLabelKey =
        behavior === 'direct_translate'
            ? 'behavior_direct'
            : behavior === 'direct_explain'
              ? 'behavior_direct_explain'
              : behavior === 'disabled'
                ? 'behavior_disabled'
                : 'behavior_toolbar';

    const allButtons = BASE_TOOLBAR_BUTTONS.map((button) => ({
        ...button,
        label: getToolbarButtonLabel(button, t),
    }));
    const smartButtons = SMART_TOOLBAR_BUTTONS.map((button) => ({
        ...button,
        label: getToolbarButtonLabel(button, t),
        matchLabel: getToolbarButtonMatchLabel(button, t),
    }));

    const orderedButtons = (Array.isArray(btnOrder) ? btnOrder : DEFAULT_BTN_ORDER)
        .map((id) => allButtons.find((button) => button.id === id))
        .filter(Boolean);

    const reorder = (list, startIndex, endIndex) => {
        const result = Array.from(list);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return result;
    };

    const onDragEnd = (result) => {
        if (!result.destination) return;

        const currentOrder = Array.isArray(btnOrder) ? btnOrder : DEFAULT_BTN_ORDER;
        const newOrder = reorder(currentOrder, result.source.index, result.destination.index);

        setBtnOrder(newOrder);
    };

    return (
        <div className='mx-auto flex w-full max-w-[880px] flex-col gap-4 px-1 pb-2'>
            <SettingsSection>
                <SettingsRow
                    title={t('config.text_selection.behavior_label')}
                    action={
                        behavior !== null ? (
                            <SettingsDropdown
                                label={t(`config.text_selection.${behaviorLabelKey}`)}
                                ariaLabel='text selection behavior'
                                selectedKey={behavior}
                                onAction={(key) => {
                                    setBehavior(key);
                                    invoke('update_tray', { language: '', copyMode: '' }).catch(() => {});
                                }}
                            >
                                <DropdownItem key='toolbar'>{t('config.text_selection.behavior_toolbar')}</DropdownItem>
                                <DropdownItem key='direct_translate'>
                                    {t('config.text_selection.behavior_direct')}
                                </DropdownItem>
                                <DropdownItem key='direct_explain'>
                                    {t('config.text_selection.behavior_direct_explain')}
                                </DropdownItem>
                                <DropdownItem key='disabled'>
                                    {t('config.text_selection.behavior_disabled')}
                                </DropdownItem>
                            </SettingsDropdown>
                        ) : null
                    }
                />
            </SettingsSection>

            <SettingsSection title={t('config.text_selection.buttons_title')}>
                <div>
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable
                            droppableId='toolbar-buttons'
                            direction='vertical'
                        >
                            {(provided) => (
                                <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                >
                                    {orderedButtons.map((button, index) => (
                                        <Draggable
                                            key={button.id}
                                            draggableId={button.id}
                                            index={index}
                                        >
                                            {(draggableProvided) => (
                                                <div
                                                    ref={draggableProvided.innerRef}
                                                    {...draggableProvided.draggableProps}
                                                >
                                                    <ToolbarButtonItem
                                                        button={button}
                                                        label={button.label}
                                                        dragHandleProps={draggableProvided.dragHandleProps}
                                                        t={t}
                                                        isChineseUI={isChineseUI}
                                                    />
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>
                </div>
            </SettingsSection>

            <SettingsSection
                title={t('config.text_selection.smart_title', {
                    defaultValue: '智能识别能力',
                })}
            >
                {smartButtons.map((button) => (
                    <SmartCapabilityRow
                        key={button.id}
                        button={button}
                        smartConfig={smartConfig}
                        setSmartConfig={setSmartConfig}
                        isChineseUI={isChineseUI}
                    />
                ))}
            </SettingsSection>
        </div>
    );
}
