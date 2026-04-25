import { useRoutes } from 'react-router-dom';
import React from 'react';
import { Card } from '@nextui-org/react';
import WindowHeader, {
    WindowHeaderTitle,
    WindowHeaderWindowControls,
} from '../../components/WindowHeader';
import SideBar from './components/SideBar';
import { osType } from '../../utils/env';
import routes from './routes';
import './style.css';

export default function Config() {
    const page = useRoutes(routes);

    // loading 递层由 main.jsx 的启动提交流程负责移除，无需在组件内处理

    return (
        <div
            className={`bg-content1 h-screen flex flex-col overflow-hidden select-none cursor-default ${
                osType === 'Linux' && 'rounded-[10px] border-1 border-default-100'
            }`}
        >
            <WindowHeader
                style={{ background: 'transparent' }}
                left={
                    <WindowHeaderTitle
                        icon={
                            <img
                                alt='Immersive Input'
                                src='icon.svg'
                                draggable={false}
                                style={{ width: 18, height: 18 }}
                            />
                        }
                        textStyle={{ fontSize: 13 }}
                    >
                        Immersive Input
                    </WindowHeaderTitle>
                }
                right={<WindowHeaderWindowControls hideOnDarwin />}
            />
            <div className='flex flex-1 min-h-0'>
                <Card
                    shadow='none'
                    className='bg-content1 w-[202px] h-full rounded-none border-r-1 border-default-100 shrink-0'
                >
                    <div className='py-[8px]'>
                        <div className='px-[6px] pt-[3px] pb-[10px]'>
                            <div className='flex flex-col items-center gap-[4px]'>
                                <img
                                    alt='Immersive Input'
                                    src='icon.svg'
                                    className='h-[44px] w-[44px]'
                                    draggable={false}
                                />
                                <span className='text-[12px] font-semibold text-default-600 tracking-wide select-none'>
                                    Immersive Input
                                </span>
                            </div>
                        </div>
                        <SideBar />
                    </div>
                </Card>
                <div className='bg-background flex-1 min-h-0 overflow-y-auto p-[10px]'>
                    {page}
                </div>
            </div>
        </div>
    );
}
