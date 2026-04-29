import {
    Card,
    CardBody,
    DropdownItem,
    Switch,
    Tooltip,
} from '@nextui-org/react';
import { invoke } from '@tauri-apps/api';
import React from 'react';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { useTranslation } from 'react-i18next';

import SettingsDropdown from '../../../../components/SettingsDropdown';
import { useConfig } from '../../../../hooks/useConfig';
import {
    BASE_TOOLBAR_BUTTONS,
    getToolbarButtonMatchLabel,
    getToolbarButtonLabel,
    SMART_TOOLBAR_BUTTONS,
    TOOLBAR_DRAG_ICON,
} from '../../../../utils/textSelectionToolbar';

const DEFAULT_BTN_ORDER = ['translate', 'explain', 'format', 'lightai'];

function ToolbarButtonItem({ button, label, dragHandleProps }) {
    const DragIcon = TOOLBAR_DRAG_ICON;
    const Icon = button.Icon;
    const [enabled, setEnabled] = useConfig(button.cfgKey, true);

    return (
        <div className='flex items-center justify-between rounded-xl border border-divider/70 bg-content1 px-4 py-3 transition-colors hover:bg-content2/60'>
            <div className='flex min-w-0 flex-1 items-center gap-3'>
                <div
                    {...dragHandleProps}
                    className='flex h-8 w-8 cursor-grab items-center justify-center rounded-lg text-default-400 transition-colors hover:bg-default-100 hover:text-default-600 active:cursor-grabbing'
                >
                    <DragIcon size={16} />
                </div>
                <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-default-100 text-default-600'>
                    <Icon size={18} />
                </div>
                <h2 className='truncate text-sm font-medium text-foreground'>
                    {label}
                </h2>
            </div>
            <Switch
                size='sm'
                isSelected={enabled ?? true}
                onValueChange={setEnabled}
            />
        </div>
    );
}

export default function TextSelection() {
    const { t } = useTranslation();
    const [behavior, setBehavior] = useConfig('text_select_behavior', 'toolbar');
    const [btnOrder, setBtnOrder] = useConfig('toolbar_btn_order', DEFAULT_BTN_ORDER);

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
                                    invoke('update_tray', { language: '', copyMode: '' }).catch(() => {});
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

            <Card className='mb-[10px]'>
                <CardBody className='gap-3'>
                    <h3 className='text-[16px] font-bold'>
                        {t('config.text_selection.buttons_title')}
                    </h3>
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId='toolbar-buttons' direction='vertical'>
                            {(provided) => (
                                <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                    className='space-y-3'
                                >
                                    {orderedButtons.map((button, index) => (
                                        <Draggable
                                            key={button.id}
                                            draggableId={button.id}
                                            index={index}
                                        >
                                            {(provided) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                >
                                                    <ToolbarButtonItem
                                                        button={button}
                                                        label={button.label}
                                                        dragHandleProps={provided.dragHandleProps}
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
                                defaultValue: '\u667a\u80fd\u8bc6\u522b\u80fd\u529b',
                            })}
                        </h3>
                        <p className='text-xs text-default-400'>
                            {t('config.text_selection.smart_description', {
                                defaultValue:
                                    '\u60ac\u6d6e\u53ef\u67e5\u770b\u89e6\u53d1\u6761\u4ef6',
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
