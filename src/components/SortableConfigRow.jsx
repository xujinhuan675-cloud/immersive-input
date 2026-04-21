import React from 'react';
import { LuGripVertical } from 'react-icons/lu';

export default function SortableConfigRow(props) {
    const {
        dragHandleProps,
        icon,
        title,
        description,
        actions,
        showDragHandle = true,
    } = props;

    return (
        <div className='flex items-center justify-between rounded-xl border border-divider/70 bg-content1 px-4 py-3 transition-colors hover:bg-content2/60'>
            <div className='flex min-w-0 flex-1 items-center gap-3'>
                {showDragHandle ? (
                    <div
                        {...dragHandleProps}
                        className='flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-default-400 transition-colors hover:bg-default-100 hover:text-default-600 active:cursor-grabbing'
                    >
                        <LuGripVertical size={16} />
                    </div>
                ) : (
                    <div className='h-8 w-8 shrink-0' />
                )}
                <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-default-100 text-default-600'>
                    {icon}
                </div>
                <div className='min-w-0 flex-1'>
                    <h2 className='truncate text-sm font-medium text-foreground'>
                        {title}
                    </h2>
                    {description ? (
                        <p className='truncate text-xs text-default-400'>
                            {description}
                        </p>
                    ) : null}
                </div>
            </div>
            {actions ? (
                <div className='ml-3 flex shrink-0 items-center gap-1.5'>
                    {actions}
                </div>
            ) : null}
        </div>
    );
}
