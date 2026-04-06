import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { Card, CardBody, Spacer, Switch, Select, SelectItem } from '@nextui-org/react';
import { RxDragHandleHorizontal } from 'react-icons/rx';
import { useTranslation } from 'react-i18next';
import React from 'react';

import { useConfig } from '../../../../hooks/useConfig';

const DEFAULT_BTN_ORDER = ['translate', 'explain', 'format', 'lightai'];

function ToolbarButtonItem({ label, cfgKey, dragHandleProps }) {
    const [enabled, setEnabled] = useConfig(cfgKey, true);
    return (
        <div className='bg-content2 rounded-md px-[10px] py-[20px] flex justify-between'>
            <div className='flex'>
                <div
                    {...dragHandleProps}
                    className='text-2xl my-auto'
                >
                    <RxDragHandleHorizontal />
                </div>
                <Spacer x={2} />
                <h2 className='my-auto'>{label}</h2>
            </div>
            <div className='flex items-center'>
                <Switch
                    size='sm'
                    isSelected={enabled ?? true}
                    onValueChange={setEnabled}
                />
            </div>
        </div>
    );
}

export default function TextSelection() {
    const { t } = useTranslation();
    const [behavior, setBehavior] = useConfig('text_select_behavior', 'toolbar');
    const [btnOrder, setBtnOrder] = useConfig('toolbar_btn_order', DEFAULT_BTN_ORDER);

    const ALL_BUTTONS = [
        { id: 'translate', label: t('config.text_selection.btn_translate'), cfgKey: 'toolbar_btn_translate' },
        { id: 'explain',   label: t('config.text_selection.btn_explain'),   cfgKey: 'toolbar_btn_explain'   },
        { id: 'format',    label: t('config.text_selection.btn_format'),    cfgKey: 'toolbar_btn_format'    },
        { id: 'lightai',   label: t('config.text_selection.btn_lightai'),   cfgKey: 'toolbar_btn_lightai'   },
    ];

    const orderedButtons = (Array.isArray(btnOrder) ? btnOrder : DEFAULT_BTN_ORDER)
        .map((id) => ALL_BUTTONS.find((b) => b.id === id))
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
        <div className='p-[10px] max-w-[800px]'>
            <Card className='mb-[10px]'>
                <CardBody>
                    <div className='flex items-center justify-between'>
                        <div className='text-[14px] font-medium'>
                            {t('config.text_selection.behavior_label')}
                        </div>
                        <Select
                            size='sm'
                            selectedKeys={behavior ? [behavior] : ['toolbar']}
                            onSelectionChange={(keys) => setBehavior([...keys][0])}
                            className='max-w-[160px]'
                            aria-label={t('config.text_selection.behavior_label')}
                        >
                            <SelectItem key='toolbar'>
                                {t('config.text_selection.behavior_toolbar')}
                            </SelectItem>
                            <SelectItem key='direct_translate'>
                                {t('config.text_selection.behavior_direct')}
                            </SelectItem>
                            <SelectItem key='disabled'>
                                {t('config.text_selection.behavior_disabled')}
                            </SelectItem>
                        </Select>
                    </div>
                </CardBody>
            </Card>

            <Card className='mb-[10px]'>
                <CardBody>
                    <h3 className='text-[16px] font-bold mb-[12px]'>
                        {t('config.text_selection.buttons_title')}
                    </h3>
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId='toolbar-buttons' direction='vertical'>
                            {(provided) => (
                                <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                >
                                    {orderedButtons.map((btn, i) => (
                                        <Draggable key={btn.id} draggableId={btn.id} index={i}>
                                            {(provided) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                >
                                                    <ToolbarButtonItem
                                                        dragHandleProps={provided.dragHandleProps}
                                                        label={btn.label}
                                                        cfgKey={btn.cfgKey}
                                                    />
                                                    <Spacer y={2} />
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
        </div>
    );
}
