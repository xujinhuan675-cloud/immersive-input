import { LazyMotion, domAnimation, m } from 'framer-motion';
import {
    FiArrowRight,
    FiArrowUpRight,
    FiBookOpen,
    FiCheck,
    FiCommand,
    FiCopy,
    FiCpu,
    FiDownload,
    FiEdit3,
    FiGlobe,
    FiLayers,
    FiMessageSquare,
    FiMonitor,
    FiMousePointer,
    FiSearch,
    FiShield,
    FiZap,
} from 'react-icons/fi';
import { BsGithub, BsTelegram } from 'react-icons/bs';
import { SiApple, SiLinux, SiWindows } from 'react-icons/si';
import React from 'react';

const REPO_URL = 'https://github.com/xujinhuan675-cloud/immersive-input';
const RELEASE_URL = 'https://github.com/xujinhuan675-cloud/immersive-input/releases/latest';
const COMMUNITY_URL = 'https://t.me/flowinput';

const navLinks = [
    { label: 'Product', href: '#product' },
    { label: 'Features', href: '#features' },
    { label: 'Ecosystem', href: '#ecosystem' },
    { label: 'Download', href: '#download' },
];

const heroSignals = ['Open source', 'Cross-platform', '21 languages', '20+ engines'];

const outcomes = [
    {
        icon: FiMousePointer,
        title: 'Act on selected text',
        body: 'Translate, rewrite, explain, or chat from the text you already highlighted.',
    },
    {
        icon: FiSearch,
        title: 'Read locked content',
        body: 'Capture screen regions and turn images, PDFs, formulas, or QR codes into usable text.',
    },
    {
        icon: FiCopy,
        title: 'Put results back fast',
        body: 'Compare, refine, copy, or paste results back into the original app without context switching.',
    },
];

const features = [
    {
        icon: FiCommand,
        title: 'Global shortcuts',
        body: 'Trigger translation, OCR, AI rewrite, explain, and chat from anywhere on the desktop.',
    },
    {
        icon: FiGlobe,
        title: 'Parallel translation',
        body: 'Compare OpenAI, DeepL, Google, Baidu, Bing, Ollama, and more in one workflow.',
    },
    {
        icon: FiEdit3,
        title: 'AI rewrite styles',
        body: 'Generate concise, expanded, corrected, formal, or conversational versions of selected text.',
    },
    {
        icon: FiMessageSquare,
        title: 'Explain and chat',
        body: 'Turn selected text into a contextual explanation or continue with an AI conversation.',
    },
    {
        icon: FiCpu,
        title: 'Local and cloud ready',
        body: 'Use online AI services, local OCR, Ollama, and custom HTTP automation together.',
    },
    {
        icon: FiShield,
        title: 'Built for control',
        body: 'Keep workflows configurable with service priority, history, hotkeys, and local settings.',
    },
];

const flowSteps = [
    { step: '01', title: 'Select', body: 'Highlight text, open input translate, or capture a screen region.' },
    { step: '02', title: 'Choose', body: 'Use the floating actions, hotkeys, tray menu, or external HTTP API.' },
    { step: '03', title: 'Apply', body: 'Copy, paste, compare engines, keep chatting, or continue rewriting.' },
];

const integrations = [
    { name: 'OpenAI', src: '/logo/openai.svg' },
    { name: 'DeepL', src: '/logo/deepl.svg' },
    { name: 'Google', src: '/logo/google.svg' },
    { name: 'Bing', src: '/logo/bing.svg' },
    { name: 'Baidu', src: '/logo/baidu.svg' },
    { name: 'Volcengine', src: '/logo/volcengine.svg' },
    { name: 'Ollama', src: '/logo/ollama.png' },
    { name: 'Tesseract', src: '/logo/tesseract.png' },
];

const platforms = [
    { name: 'Windows', icon: SiWindows },
    { name: 'macOS', icon: SiApple },
    { name: 'Linux', icon: SiLinux },
];

function Reveal({ children, delay = 0, className = '' }) {
    return (
        <m.div
            className={className}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.18 }}
            transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1], delay }}
        >
            {children}
        </m.div>
    );
}

function ButtonLink({ href, icon: Icon, children, variant = 'primary' }) {
    return (
        <a
            className={`button-link ${variant}`}
            href={href}
            target='_blank'
            rel='noreferrer'
        >
            {Icon ? <Icon /> : null}
            <span>{children}</span>
        </a>
    );
}

function SectionHeader({ kicker, title, body }) {
    return (
        <div className='section-header'>
            <p className='kicker'>{kicker}</p>
            <h2>{title}</h2>
            <p>{body}</p>
        </div>
    );
}

function ProductScene() {
    return (
        <div
            className='product-scene'
            aria-hidden='true'
        >
            <div className='scene-rail'>
                <span>Translate</span>
                <span>OCR</span>
                <span>Rewrite</span>
                <span>Explain</span>
                <span>Chat</span>
            </div>
            <div className='app-window app-window-main'>
                <div className='window-titlebar'>
                    <span />
                    <span />
                    <span />
                    <strong>Flow Input</strong>
                </div>
                <div className='selection-surface'>
                    <div className='selected-text'>
                        <span />
                        <span />
                        <span />
                    </div>
                    <div className='floating-toolbar'>
                        <span>Translate</span>
                        <span>Polish</span>
                        <span>Explain</span>
                        <span>Chat</span>
                    </div>
                </div>
                <div className='result-columns'>
                    <div>
                        <small>DeepL</small>
                        <p>Cleaner bilingual copy for release notes and support replies.</p>
                    </div>
                    <div>
                        <small>OpenAI</small>
                        <p>More natural phrasing with context-aware rewrite options.</p>
                    </div>
                </div>
            </div>

            <div className='app-window app-window-ocr'>
                <div className='mini-label'>
                    <FiSearch />
                    <span>Screenshot OCR</span>
                </div>
                <div className='scan-frame'>
                    <span />
                    <span />
                    <span />
                </div>
            </div>

            <div className='app-window app-window-ai'>
                <div className='mini-label'>
                    <FiZap />
                    <span>AI Rewrite</span>
                </div>
                <p>Shorter, clearer, more direct.</p>
                <div className='rewrite-options'>
                    <span>Formal</span>
                    <span>Concise</span>
                    <span>Friendly</span>
                </div>
            </div>
        </div>
    );
}

export default function LandingPage() {
    return (
        <LazyMotion features={domAnimation}>
            <div className='landing-page'>
                <header className='site-header'>
                    <div className='shell nav-shell'>
                        <a
                            className='brand-lockup'
                            href='#top'
                        >
                            <img
                                src='/icon.svg'
                                alt='Flow Input'
                            />
                            <span>Flow Input</span>
                        </a>

                        <nav className='nav-links'>
                            {navLinks.map((item) => (
                                <a
                                    key={item.href}
                                    href={item.href}
                                >
                                    {item.label}
                                </a>
                            ))}
                        </nav>

                        <div className='nav-actions'>
                            <ButtonLink
                                href={REPO_URL}
                                icon={BsGithub}
                                variant='secondary'
                            >
                                GitHub
                            </ButtonLink>
                            <ButtonLink
                                href={RELEASE_URL}
                                icon={FiDownload}
                            >
                                Download
                            </ButtonLink>
                        </div>
                    </div>
                </header>

                <main id='top'>
                    <section className='hero-section'>
                        <ProductScene />
                        <div className='shell hero-content'>
                            <p className='hero-kicker'>AI text actions for every desktop app</p>
                            <h1>Flow Input</h1>
                            <p className='hero-subtitle'>
                                Translate, capture, rewrite, explain, and chat with text anywhere on your desktop.
                            </p>
                            <div className='hero-actions'>
                                <ButtonLink
                                    href={RELEASE_URL}
                                    icon={FiDownload}
                                >
                                    Download latest release
                                </ButtonLink>
                                <ButtonLink
                                    href={COMMUNITY_URL}
                                    icon={BsTelegram}
                                    variant='secondary'
                                >
                                    Join community
                                </ButtonLink>
                                <ButtonLink
                                    href={REPO_URL}
                                    icon={FiArrowUpRight}
                                    variant='quiet'
                                >
                                    View source
                                </ButtonLink>
                            </div>
                            <div className='hero-signals'>
                                {heroSignals.map((signal) => (
                                    <span key={signal}>{signal}</span>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section
                        className='outcome-band'
                        id='product'
                    >
                        <div className='shell outcome-grid'>
                            {outcomes.map((item, index) => {
                                const Icon = item.icon;

                                return (
                                    <Reveal
                                        key={item.title}
                                        delay={index * 0.04}
                                    >
                                        <article className='outcome-card'>
                                            <Icon />
                                            <h3>{item.title}</h3>
                                            <p>{item.body}</p>
                                        </article>
                                    </Reveal>
                                );
                            })}
                        </div>
                    </section>

                    <section
                        className='section-band'
                        id='features'
                    >
                        <div className='shell'>
                            <Reveal>
                                <SectionHeader
                                    kicker='Core product'
                                    title='One workflow layer for text, screenshots, and AI assistance.'
                                    body='Flow Input is built around the moment before productivity usually breaks: selecting text, opening another app, pasting, waiting, then coming back.'
                                />
                            </Reveal>

                            <div className='feature-grid'>
                                {features.map((feature, index) => {
                                    const Icon = feature.icon;

                                    return (
                                        <Reveal
                                            key={feature.title}
                                            delay={index * 0.04}
                                        >
                                            <article className='feature-card'>
                                                <Icon />
                                                <h3>{feature.title}</h3>
                                                <p>{feature.body}</p>
                                            </article>
                                        </Reveal>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    <section className='flow-band'>
                        <div className='shell flow-layout'>
                            <Reveal>
                                <SectionHeader
                                    kicker='How it feels'
                                    title='From screen to result in three moves.'
                                    body='The page tells a simple story for new visitors: Flow Input starts from their current context, chooses the right action, and returns usable output.'
                                />
                            </Reveal>

                            <div className='flow-steps'>
                                {flowSteps.map((item, index) => (
                                    <Reveal
                                        key={item.step}
                                        delay={index * 0.05}
                                    >
                                        <article className='flow-step'>
                                            <span>{item.step}</span>
                                            <h3>{item.title}</h3>
                                            <p>{item.body}</p>
                                        </article>
                                    </Reveal>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section
                        className='ecosystem-band'
                        id='ecosystem'
                    >
                        <div className='shell ecosystem-layout'>
                            <Reveal>
                                <SectionHeader
                                    kicker='Ecosystem'
                                    title='Bring your preferred engines with you.'
                                    body='Use cloud providers, local OCR, local models, and service priority controls instead of locking the workflow to one vendor.'
                                />
                            </Reveal>

                            <Reveal>
                                <div className='logo-grid'>
                                    {integrations.map((item) => (
                                        <div
                                            key={item.name}
                                            className='logo-tile'
                                        >
                                            <img
                                                src={item.src}
                                                alt={item.name}
                                            />
                                            <span>{item.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </Reveal>
                        </div>
                    </section>

                    <section
                        className='download-band'
                        id='download'
                    >
                        <div className='shell download-layout'>
                            <Reveal>
                                <p className='kicker'>Download and community</p>
                                <h2>Start with the desktop app, then join the Flow Input community.</h2>
                                <p>
                                    Visitors can download the latest release, inspect the open-source repository, or
                                    join Telegram for updates and feedback.
                                </p>
                                <div className='download-actions'>
                                    <ButtonLink
                                        href={RELEASE_URL}
                                        icon={FiDownload}
                                    >
                                        Download latest release
                                    </ButtonLink>
                                    <ButtonLink
                                        href={COMMUNITY_URL}
                                        icon={BsTelegram}
                                        variant='secondary-dark'
                                    >
                                        Join Telegram
                                    </ButtonLink>
                                </div>
                            </Reveal>

                            <Reveal delay={0.06}>
                                <div className='download-panel'>
                                    <div className='platform-list'>
                                        {platforms.map((item) => {
                                            const Icon = item.icon;

                                            return (
                                                <span key={item.name}>
                                                    <Icon />
                                                    {item.name}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <ul>
                                        <li>
                                            <FiCheck />
                                            <span>Floating selection toolbar</span>
                                        </li>
                                        <li>
                                            <FiCheck />
                                            <span>Translation, OCR, rewrite, explain, and chat</span>
                                        </li>
                                        <li>
                                            <FiCheck />
                                            <span>Local and online engine support</span>
                                        </li>
                                        <li>
                                            <FiCheck />
                                            <span>HTTP API for external automation</span>
                                        </li>
                                    </ul>
                                    <a
                                        className='repo-link'
                                        href={REPO_URL}
                                        target='_blank'
                                        rel='noreferrer'
                                    >
                                        Explore GitHub
                                        <FiArrowRight />
                                    </a>
                                </div>
                            </Reveal>
                        </div>
                    </section>
                </main>

                <footer className='site-footer'>
                    <div className='shell footer-layout'>
                        <div>
                            <strong>Flow Input</strong>
                            <p>Open-source AI text workflows for the desktop.</p>
                        </div>
                        <div className='footer-links'>
                            <a href={RELEASE_URL}>Releases</a>
                            <a href={REPO_URL}>GitHub</a>
                            <a href={COMMUNITY_URL}>Telegram</a>
                        </div>
                    </div>
                </footer>
            </div>
        </LazyMotion>
    );
}
