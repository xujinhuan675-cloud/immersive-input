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
        variant = 'card',
        expanded = false,
        onPress,
        children,
    } = props;
    const isListVariant = variant === 'list';
    const clickable = typeof onPress === 'function';

    const handleKeyDown = (event) => {
        if (!clickable) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;

        event.preventDefault();
        onPress();
    };

    return (
        <div
            className={`overflow-hidden bg-content1 ${
                isListVariant ? 'border-b border-default-100' : 'rounded-xl border border-divider/70'
            }`}
        >
            <div
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={onPress}
                onKeyDown={handleKeyDown}
                className={`flex items-center justify-between px-4 py-3 transition-colors ${
                    isListVariant
                        ? expanded
                            ? 'bg-default-50'
                            : 'hover:bg-default-50'
                        : expanded
                          ? 'bg-content2/60'
                          : 'hover:bg-content2/60'
                } ${clickable ? 'cursor-pointer outline-none' : ''}`}
            >
                <div className='flex min-w-0 flex-1 items-center gap-3'>
                    {showDragHandle ? (
                        <div
                            {...dragHandleProps}
                            onClick={(event) => event.stopPropagation()}
                            className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-default-400 transition-colors hover:bg-default-100 hover:text-default-600'
                        >
                            <LuGripVertical size={16} />
                        </div>
                    ) : (
                        <div className='h-8 w-8 shrink-0' />
                    )}
                    <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-default-100 text-default-600'>
                        {icon}
                    </div>
                    <div className='min-w-0 flex-1'>
                        <h2 className='truncate text-sm font-medium text-foreground'>{title}</h2>
                        {description ? <p className='truncate text-xs text-default-400'>{description}</p> : null}
                    </div>
                </div>
                {actions ? (
                    <div
                        className='ml-3 flex shrink-0 items-center gap-2'
                        onClick={(event) => event.stopPropagation()}
                    >
                        {actions}
                    </div>
                ) : null}
            </div>
            {children ? <div className='border-t border-default-100 bg-default-50/60 p-4'>{children}</div> : null}
        </div>
    );
}
