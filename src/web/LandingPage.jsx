import { FiCheck, FiDownload, FiGlobe, FiMousePointer, FiZap } from 'react-icons/fi';
import { SiWindows } from 'react-icons/si';
import React from 'react';

const VERSION = '4.2.4';
const RELEASE_URL = 'https://github.com/xujinhuan675-cloud/immersive-input/releases/latest';
const WINDOWS_DOWNLOAD_URL =
    'https://github.com/xujinhuan675-cloud/immersive-input/releases/latest/download/flow-input_4.2.4_x64.msi';

const scenarios = [
    {
        title: '网页、文档、聊天窗口里都能用',
        body: '选中文本后，翻译、解释、改写会出现在手边，不需要复制到另一个工具里来回切换。',
    },
    {
        title: '结果可以直接回到原位置',
        body: '常用操作支持实时写入，像继续打字一样把 AI 结果放回当前输入框。',
    },
    {
        title: '截图文字也能继续处理',
        body: '遇到图片、PDF 或不可复制内容时，先 OCR 成文本，再接着翻译、润色或解释。',
    },
];

const details = [
    `当前版本 ${VERSION}`,
    '适用于 Windows 10/11',
    '支持划词翻译、OCR、AI 改写与解释',
];

function DownloadButton({ href, children, variant = 'primary' }) {
    return (
        <a
            className={`download-button ${variant}`}
            href={href}
            target='_blank'
            rel='noreferrer'
        >
            {variant === 'primary' ? <FiDownload /> : null}
            <span>{children}</span>
        </a>
    );
}

function ProductPreview() {
    return (
        <div
            className='product-preview'
            aria-label='Flow Input 使用场景预览'
        >
            <div className='preview-window'>
                <div className='preview-titlebar'>
                    <span />
                    <span />
                    <span />
                    <strong>正在编辑邮件</strong>
                </div>
                <div className='preview-doc'>
                    <p>Could you make this paragraph clearer before I send it?</p>
                    <div className='selected-line'>让这句话更自然、更像中文表达。</div>
                    <div className='floating-actions'>
                        <span>翻译</span>
                        <span>改写</span>
                        <span>解释</span>
                    </div>
                </div>
                <div className='stream-result'>
                    <FiZap />
                    <span>正在实时写入更自然的表达...</span>
                </div>
            </div>
        </div>
    );
}

export default function LandingPage() {
    return (
        <main className='landing-page'>
            <section className='hero-section'>
                <div className='shell hero-grid'>
                    <div className='hero-copy'>
                        <div className='brand-line'>
                            <img
                                src='/icon.svg'
                                alt='Flow Input'
                            />
                            <span>Flow Input</span>
                        </div>

                        <p className='kicker'>桌面上的顺手 AI 文本工具</p>
                        <h1>选中文本，结果就在手边。</h1>
                        <p className='hero-subtitle'>
                            划词翻译、AI 改写、OCR 和解释助手，在网页、文档、聊天软件和任意桌面程序里都能自然接上你的工作流。
                        </p>

                        <div className='hero-actions'>
                            <DownloadButton href={WINDOWS_DOWNLOAD_URL}>下载 Windows 版</DownloadButton>
                            <DownloadButton
                                href={RELEASE_URL}
                                variant='secondary'
                            >
                                查看其他版本
                            </DownloadButton>
                        </div>

                        <div className='release-details'>
                            {details.map((item) => (
                                <span key={item}>
                                    <FiCheck />
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>

                    <ProductPreview />
                </div>
            </section>

            <section className='scenario-section'>
                <div className='shell scenario-grid'>
                    {scenarios.map((item, index) => {
                        const Icon = index === 0 ? FiGlobe : index === 1 ? FiMousePointer : SiWindows;

                        return (
                            <article
                                className='scenario-card'
                                key={item.title}
                            >
                                <Icon />
                                <h2>{item.title}</h2>
                                <p>{item.body}</p>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className='download-section'>
                <div className='shell download-card'>
                    <div>
                        <p className='kicker'>Download</p>
                        <h2>一个入口，先装起来用。</h2>
                        <p>后续可以把这里替换为国内镜像和海外镜像，普通用户始终只需要记住这个页面。</p>
                    </div>
                    <div className='download-stack'>
                        <DownloadButton href={WINDOWS_DOWNLOAD_URL}>下载 Windows 版</DownloadButton>
                        <DownloadButton
                            href={RELEASE_URL}
                            variant='secondary'
                        >
                            备用下载
                        </DownloadButton>
                    </div>
                </div>
            </section>
        </main>
    );
}
