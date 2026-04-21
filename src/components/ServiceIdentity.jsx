import React from 'react';

function mergeClassName(...classNames) {
    return classNames.filter(Boolean).join(' ');
}

function cloneIconNode(iconNode, className) {
    if (!React.isValidElement(iconNode)) {
        return iconNode;
    }

    return React.cloneElement(iconNode, {
        className: mergeClassName(iconNode.props.className, className),
    });
}

export function ServiceIcon(props) {
    const { iconSrc, iconNode, className = '', imageClassName = '', iconClassName = 'text-[16px]' } = props;
    const frameClassName = mergeClassName('flex h-[24px] w-[24px] shrink-0 items-center justify-center', className);

    if (iconSrc) {
        return (
            <div className={frameClassName}>
                <img
                    src={iconSrc}
                    alt=''
                    aria-hidden='true'
                    className={mergeClassName('block max-h-[16px] max-w-[16px] object-contain', imageClassName)}
                    draggable={false}
                />
            </div>
        );
    }

    if (iconNode) {
        return (
            <div className={mergeClassName(frameClassName, 'rounded-[6px] bg-default-50')}>
                {cloneIconNode(iconNode, iconClassName)}
            </div>
        );
    }

    return (
        <div
            className={mergeClassName(frameClassName, 'rounded-[6px] bg-default-200')}
            aria-hidden='true'
        />
    );
}

export default function ServiceIdentity(props) {
    const {
        iconSrc,
        iconNode,
        title,
        subtitle,
        className = '',
        titleClassName = '',
        subtitleClassName = '',
        iconClassName,
        imageClassName,
    } = props;

    return (
        <div className={mergeClassName('flex min-w-0 items-center gap-[10px]', className)}>
            <ServiceIcon
                iconSrc={iconSrc}
                iconNode={iconNode}
                iconClassName={iconClassName}
                imageClassName={imageClassName}
            />
            <div className='min-w-0'>
                <p
                    className={mergeClassName(
                        'truncate text-[13px] font-medium leading-5 text-default-700',
                        titleClassName
                    )}
                >
                    {title}
                </p>
                {subtitle ? (
                    <p className={mergeClassName('truncate text-[12px] leading-4 text-default-400', subtitleClassName)}>
                        {subtitle}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
