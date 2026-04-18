import React from 'react';
import { LuChevronsUpDown } from 'react-icons/lu';

export default function CompactDropdownButton(props) {
    const {
        label,
        startContent,
        open = false,
        className = '',
        ...rest
    } = props;

    return (
        <button
            type='button'
            className={`group inline-flex items-center gap-2 rounded-xl border border-default-200/80 bg-content1 px-3 py-2 text-sm font-medium text-default-700 shadow-sm transition-all hover:border-default-300 hover:bg-content2/80 hover:text-default-900 ${open ? 'border-primary/35 bg-content2/80 text-default-900' : ''} ${className}`}
            {...rest}
        >
            <span className='flex min-w-0 items-center gap-2'>
                {startContent ? (
                    <span className='shrink-0 text-default-500 transition-colors group-hover:text-primary'>
                        {startContent}
                    </span>
                ) : null}
                <span className='truncate'>{label}</span>
            </span>
            <LuChevronsUpDown
                className={`shrink-0 text-[15px] text-default-400 transition-all duration-200 ${open ? 'text-default-600' : ''}`}
            />
        </button>
    );
}
