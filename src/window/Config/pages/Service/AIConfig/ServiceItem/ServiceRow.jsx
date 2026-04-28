import { Button } from '@nextui-org/react';
import React from 'react';

import SortableConfigRow from '../../../../../../components/SortableConfigRow';

export function ConfigServiceListRow(props) {
    return <SortableConfigRow {...props} />;
}

export function ConfigServiceIconButton(props) {
    const { children, className = '', color, ...rest } = props;

    return (
        <Button
            isIconOnly
            size='sm'
            variant='light'
            className={`text-default-500 ${className}`.trim()}
            color={color}
            {...rest}
        >
            {children}
        </Button>
    );
}
