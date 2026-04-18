import { Dropdown, DropdownMenu, DropdownTrigger } from '@nextui-org/react';
import React from 'react';

import CompactDropdownButton from './CompactDropdownButton';

const MENU_CLASSNAMES = {
    base: 'p-1.5',
    content: 'rounded-2xl border border-default-200/80 bg-content1 shadow-[0_18px_48px_-20px_rgba(15,23,42,0.28)]',
};

const ITEM_CLASSES = {
    base: 'rounded-xl px-3 py-2 data-[hover=true]:bg-default-100 data-[selectable=true]:focus:bg-default-100 data-[selected=true]:bg-primary-50 data-[selected=true]:text-primary-700',
    title: 'text-sm',
    selectedIcon: 'text-primary-600',
};

export default function SettingsDropdown(props) {
    const {
        label,
        ariaLabel,
        selectedKey,
        onAction,
        children,
        className = '',
        menuClassName = '',
        placement = 'bottom-end',
    } = props;
    const [open, setOpen] = React.useState(false);
    const selectedKeys =
        selectedKey === undefined || selectedKey === null
            ? undefined
            : new Set([selectedKey]);

    return (
        <Dropdown
            placement={placement}
            onOpenChange={setOpen}
        >
            <DropdownTrigger>
                <div>
                    <CompactDropdownButton
                        label={label}
                        open={open}
                        className={`w-[128px] justify-between rounded-2xl border-default-300/80 px-2.5 py-2.5 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] hover:border-default-400/80 hover:bg-content2/80 ${className}`}
                    />
                </div>
            </DropdownTrigger>
            <DropdownMenu
                aria-label={ariaLabel}
                className={menuClassName}
                classNames={MENU_CLASSNAMES}
                itemClasses={ITEM_CLASSES}
                selectedKeys={selectedKeys}
                selectionMode={selectedKeys ? 'single' : undefined}
                onAction={(key) => {
                    onAction?.(key);
                    setOpen(false);
                }}
            >
                {children}
            </DropdownMenu>
        </Dropdown>
    );
}
