import React from 'react';

export function SettingsSection(props) {
    const { title, action, children, className = '' } = props;

    return (
        <section className={`overflow-hidden rounded-xl border border-default-200/80 bg-content1 ${className}`.trim()}>
            {title || action ? (
                <div className='flex items-center justify-between gap-3 border-b border-default-100 px-5 py-3'>
                    {title ? <h2 className='text-[16px] font-bold text-foreground'>{title}</h2> : <div />}
                    {action ? <div className='shrink-0'>{action}</div> : null}
                </div>
            ) : null}
            {children}
        </section>
    );
}

export function SettingsRow(props) {
    const { title, description, action, children, className = '' } = props;

    return (
        <div className={`min-h-[62px] border-b border-default-100 px-5 py-4 last:border-b-0 ${className}`.trim()}>
            <div className='flex items-start justify-between gap-5'>
                <div className='min-w-0 flex-1'>
                    <h3 className='text-[14px] font-medium text-foreground'>{title}</h3>
                    {description ? (
                        <p className='mt-1 max-w-[640px] text-xs leading-5 text-default-500'>{description}</p>
                    ) : null}
                </div>
                {action ? <div className='flex shrink-0 items-center justify-end pt-0.5'>{action}</div> : null}
            </div>
            {children ? <div className='mt-4'>{children}</div> : null}
        </div>
    );
}
