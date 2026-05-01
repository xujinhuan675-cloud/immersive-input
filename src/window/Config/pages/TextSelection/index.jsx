import {
    Button,
    Card,
    CardBody,
    DropdownItem,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Switch,
    Tooltip,
    useDisclosure,
} from '@nextui-org/react';
import { invoke } from '@tauri-apps/api';
import React, { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { useTranslation } from 'react-i18next';
import { LuPencilLine } from 'react-icons/lu';

import SettingsDropdown from '../../../../components/SettingsDropdown';
import { useConfig } from '../../../../hooks/useConfig';
import {
    BASE_TOOLBAR_BUTTONS,
    getToolbarButtonMatchLabel,
    getToolbarButtonLabel,
    SMART_TOOLBAR_BUTTONS,
    TOOLBAR_BUTTON_ACTION_BEHAVIORS,
} from '../../../../utils/textSelectionToolbar';
import {
    ConfigServiceIconButton,
    ConfigServiceListRow,
} from '../Service/AIConfig/ServiceItem/ServiceRow';

const DEFAULT_BTN_ORDER = ['translate', 'explain', 'format', 'lightai'];

function getLocalizedDefaultValue(isChineseUI, zhText, enText) {
    return isChineseUI ? zhText : enText;
}

function getButtonActionOptions(button, t, isChineseUI) {
    const options = [
        {
            key: TOOLBAR_BUTTON_ACTION_BEHAVIORS.WINDOW,
            label: t('config.text_selection.lightai_action_window', {
                defaultValue: getLocalizedDefaultValue(
                    isChineseUI,
                    '打开窗口',
                    'Open Window'
                ),
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
                defaultValue: getLocalizedDefaultValue(
                    isChineseUI,
                    '直接应用结果',
                    'Direct Apply'
                ),
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
                defaultValue: getLocalizedDefaultValue(
                    isChineseUI,
                    '流式输入结果',
                    'Stream Input Result'
                ),
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
    return (
        options.find((option) => option.key === actionBehavior)?.description ??
        options[0].description
    );
}

function ToolbarButtonActionModal(props) {
    const {
        button,
        label,
        actionBehavior,
        setActionBehavior,
        t,
        isChineseUI,
    } = props;
    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const [draftBehavior, setDraftBehavior] = useState(
        actionBehavior ?? TOOLBAR_BUTTON_ACTION_BEHAVIORS.WINDOW
    );
    const Icon = button.Icon;
    const options = useMemo(
        () => getButtonActionOptions(button, t, isChineseUI),
        [button, t, isChineseUI]
    );

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setDraftBehavior(actionBehavior ?? TOOLBAR_BUTTON_ACTION_BEHAVIORS.WINDOW);
    }, [actionBehavior, isOpen]);

    return (
        <>
            <ConfigServiceIconButton onPress={onOpen}>
                <LuPencilLine className='text-[18px]' />
            </ConfigServiceIconButton>

            <Modal isOpen={isOpen} onOpenChange={onOpenChange} scrollBehavior='inside'>
                <ModalContent className='max-h-[80vh]'>
                    {(onClose) => (
                        <>
                            <ModalHeader>
                                <div className='flex items-center gap-3'>
                                    <div className='flex h-[28px] w-[28px] items-center justify-center rounded-[10px] bg-primary-100 text-primary'>
                                        <Icon size={16} />
                                    </div>
                                    <div className='flex flex-col'>
                                        <span className='text-sm font-semibold text-foreground'>
                                            {label}
                                        </span>
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
                                <Button variant='light' onPress={onClose}>
                                    {t('common.cancel', {
                                        defaultValue: getLocalizedDefaultValue(
                                            isChineseUI,
                                            '取消',
                                            'Cancel'
                                        ),
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
                                        defaultValue: getLocalizedDefaultValue(
                                            isChineseUI,
                                            '保存',
                                            'Save'
                                        ),
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
            icon={<Icon size={18} />}
            title={label}
            description={getButtonActionSummary(
                button,
                actionBehavior,
                t,
                isChineseUI
            )}
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

function BasicToolbarButtonRow(props) {
    const { button, label, dragHandleProps, isChineseUI } = props;
    const [enabled, setEnabled] = useConfig(button.cfgKey, true);
    const Icon = button.Icon;

    return (
        <ConfigServiceListRow
            dragHandleProps={dragHandleProps}
            icon={<Icon size={18} />}
            title={label}
            description={getLocalizedDefaultValue(
                isChineseUI,
                '点击后直接整理选中文本并回填。',
                'Format the selected text and apply it immediately.'
            )}
            actions={
                <Switch
                    size='sm'
                    isSelected={enabled ?? true}
                    onValueChange={setEnabled}
                />
            }
        />
    );
}

function ToolbarButtonItem(props) {
    const { button } = props;

    if (button.actionBehaviorKey) {
        return <ConfigurableToolbarButtonRow {...props} />;
    }

    return <BasicToolbarButtonRow {...props} />;
}

export default function TextSelection() {
    const { t, i18n } = useTranslation();
    const [behavior, setBehavior] = useConfig('text_select_behavior', 'toolbar');
    const [btnOrder, setBtnOrder] = useConfig('toolbar_btn_order', DEFAULT_BTN_ORDER);
    const isChineseUI = String(
        i18n?.resolvedLanguage || i18n?.language || ''
    ).toLowerCase().startsWith('zh');

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
        const newOrder = reorder(
            currentOrder,
            result.source.index,
            result.destination.index
        );

        setBtnOrder(newOrder);
    };

    return (
        <div className='w-full p-[10px]'>
            <Card className='mb-[10px]'>
                <CardBody>
                    <div className='flex items-center justify-between gap-4'>
                        <h3 className='text-sm font-medium text-foreground'>
                            {t('config.text_selection.behavior_label')}
                        </h3>
                        {behavior !== null && (
                            <SettingsDropdown
                                label={t(`config.text_selection.${behaviorLabelKey}`)}
                                ariaLabel='text selection behavior'
                                selectedKey={behavior}
                                onAction={(key) => {
                                    setBehavior(key);
                                    invoke('update_tray', { language: '', copyMode: '' }).catch(
                                        () => {}
                                    );
                                }}
                            >
                                <DropdownItem key='toolbar'>
                                    {t('config.text_selection.behavior_toolbar')}
                                </DropdownItem>
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
                        )}
                    </div>
                </CardBody>
            </Card>

            <Card className='mb-[10px] border border-default-200/70 bg-content1/90 shadow-none'>
                <CardBody className='p-4'>
                    <h3 className='mb-4 text-[16px] font-bold'>
                        {t('config.text_selection.buttons_title')}
                    </h3>
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId='toolbar-buttons' direction='vertical'>
                            {(provided) => (
                                <div
                                    className='space-y-3'
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
                                                        dragHandleProps={
                                                            draggableProvided.dragHandleProps
                                                        }
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
                </CardBody>
            </Card>

            <Card>
                <CardBody className='gap-3'>
                    <div className='flex items-center justify-between gap-4'>
                        <h3 className='text-[16px] font-bold'>
                            {t('config.text_selection.smart_title', {
                                defaultValue: '智能识别能力',
                            })}
                        </h3>
                        <p className='text-xs text-default-400'>
                            {t('config.text_selection.smart_description', {
                                defaultValue: '悬浮可查看触发条件',
                            })}
                        </p>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                        {smartButtons.map((button) => {
                            const Icon = button.Icon;

                            return (
                                <Tooltip
                                    key={button.id}
                                    delay={200}
                                    placement='top'
                                    content={
                                        <div className='max-w-[220px] px-1 py-0.5'>
                                            <div className='text-sm font-semibold text-foreground'>
                                                {button.label}
                                            </div>
                                            <div className='mt-1 text-xs leading-5 text-default-500'>
                                                {button.matchLabel}
                                            </div>
                                            <div className='mt-2 rounded-md bg-default-100 px-2 py-1 font-mono text-[11px] text-default-600'>
                                                {button.example}
                                            </div>
                                        </div>
                                    }
                                >
                                    <div className='inline-flex items-center gap-2 rounded-full border border-divider/70 bg-content1 px-3 py-2 text-sm text-default-600 transition-colors hover:bg-content2/70 hover:text-foreground'>
                                        <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-default-100 text-primary'>
                                            <Icon size={14} />
                                        </div>
                                        <span className='whitespace-nowrap'>
                                            {button.label}
                                        </span>
                                    </div>
                                </Tooltip>
                            );
                        })}
                    </div>
                </CardBody>
            </Card>
        </div>
    );
}
