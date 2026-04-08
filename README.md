<img width="200px" src="public/icon.svg" align="left"/>

# Immersive Input (沉浸式输入)

> 🌈 一个跨平台的 AI 驱动文本增强工具

![License](https://img.shields.io/github/license/pot-app/pot-desktop.svg)
![Tauri](https://img.shields.io/badge/Tauri-1.6.8-blue?logo=tauri)
![JavaScript](https://img.shields.io/badge/-JavaScript-yellow?logo=javascript&logoColor=white)
![Rust](https://img.shields.io/badge/-Rust-orange?logo=rust&logoColor=white)
![Windows](https://img.shields.io/badge/-Windows-blue?logo=windows&logoColor=white)
![MacOS](https://img.shields.io/badge/-macOS-black?&logo=apple&logoColor=white)
![Linux](https://img.shields.io/badge/-Linux-yellow?logo=linux&logoColor=white)

<br/>
<hr/>
<div align="center">

<h3>中文</h3>

# 目录

</div>

-   [项目架构](#项目架构)
-   [使用说明](#使用说明)
-   [特色功能](#特色功能)
-   [支持接口](#支持接口)
-   [插件系统](#插件系统)
-   [安装指南](#安装指南)
-   [外部调用](#外部调用)
-   [Wayland 支持](#wayland-支持)
-   [手动编译](#手动编译)
-   [感谢](#感谢)
-   [开发注意事项](#开发注意事项--已知技术卡点)

<div align="center">

# 项目架构

</div>

> Tauri 1.x + React（Vite）+ Rust，所有窗口共享同一个 `index.html` 入口，通过 `appWindow.label` 路由到对应的前端组件。

```
immersive-input/
├── src/                            # 前端（React + Vite）
│   ├── main.jsx                    # 应用入口：初始化 store，挂载 React
│   ├── App.jsx                     # 根组件：按 appWindow.label 路由到对应窗口
│   ├── style.css                   # 全局样式
│   │
│   ├── components/                 # 公共组件
│   │   ├── AuthGuard.jsx           # 认证守卫（需要登录才能访问的窗口）
│   │   └── WindowControl/          # 自定义窗口控制按钮
│   │
│   ├── hooks/                      # React Hooks
│   │   ├── useConfig.jsx           # 核心配置 Hook：Tauri store 双向同步，支持跨窗口事件广播
│   │   ├── useSyncAtom.jsx         # Jotai atom 与 useConfig 的同步桥接
│   │   ├── useVoice.jsx            # 语音合成
│   │   └── useToastStyle.jsx       # Toast 样式适配
│   │
│   ├── utils/                      # 工具函数
│   │   ├── store.js                # Tauri store 初始化（带文件监听器，自动同步 Rust 侧配置）
│   │   ├── textAnalyzer.js         # 智能文字类型检测（URL/邮件/路径/颜色/数字表达式）
│   │   ├── formatter.js            # 文本格式化（变量名转换等）
│   │   ├── service_instance.ts     # 服务实例 ID 解析工具
│   │   ├── language.ts             # 支持语言列表
│   │   ├── auth.js                 # 鉴权工具
│   │   └── lang_detect.js          # 客户端语种检测
│   │
│   ├── services/                   # 各类外部服务（每项服务 = index.jsx + Config.jsx + info.ts）
│   │   ├── translate/              # 20+ 翻译服务（deepl/openai/google/baidu/bing 等）
│   │   ├── recognize/              # OCR 服务（system/tesseract/baidu/tencent/iflytek 等）
│   │   ├── tts/                    # 语音合成服务（lingva）
│   │   ├── collection/             # 生词本服务（anki/eudic）
│   │   └── light_ai/               # 轻 AI 润色（openai 接口封装）
│   │
│   ├── i18n/
│   │   └── locales/                # 21 种语言翻译 JSON（zh_CN, en_US, ja_JP ...）
│   │
│   └── window/                     # 各窗口前端组件
│       ├── Config/                 # 设置窗口（侧边栏多页面路由）
│       │   ├── pages/
│       │   │   ├── General/        # 通用设置
│       │   │   ├── Translate/      # 翻译设置
│       │   │   ├── Recognize/      # 文字识别设置
│       │   │   ├── Hotkey/         # 快捷键设置
│       │   │   ├── Service/        # 服务管理（翻译/OCR/TTS/生词本/AI API）
│       │   │   ├── AIFeatures/     # AI 功能设置（轻 AI 参数、润色 Prompt）
│       │   │   ├── TextSelection/  # 划词设置（行为模式 + 工具栏按钮开关/排序）★ 新增
│       │   │   ├── History/        # 翻译与 AI 历史记录
│       │   │   ├── Backup/         # 备份与恢复
│       │   │   ├── Account/        # 账号管理
│       │   │   └── About/          # 关于
│       │   ├── components/SideBar/ # 侧边栏导航
│       │   └── routes/             # React Router 路由表
│       ├── FloatToolbar/           # 浮动工具栏（划词后弹出）★ 已重构为配置/行为解耦架构
│       ├── Translate/              # 翻译窗口（主翻译功能，含多引擎并行展示）
│       ├── LightAI/                # 轻 AI 润色窗口
│       ├── Explain/                # 文本解释窗口（AI 深度解析）
│       ├── Chat/                   # AI 对话窗口
│       ├── Recognize/              # OCR 识别窗口
│       ├── Updater/                # 自动更新窗口
│       ├── Vault/                  # 密码本窗口
│       ├── Phrases/                # 常用语窗口
│       ├── Screenshot/             # 截图选区窗口
│       └── Login/                  # 登录/注册窗口
│
├── src-tauri/src/                  # 后端（Rust）
│   ├── main.rs                     # 应用入口：注册命令/插件/快捷键/托盘/鼠标钩子
│   ├── window.rs                   # 所有窗口的创建与生命周期管理
│   │                               #   ⚠ 窗口创建必须在独立线程中执行（见开发卡点 1）
│   ├── cmd.rs                      # Tauri 命令（get_text/paste_result/write_clipboard 等）
│   ├── config.rs                   # 配置读写（StoreWrapper + get/set/reload）
│   │                               #   ⚠ reload() 确保 Rust 侧始终读取 JS 端最新配置
│   ├── mouse_hook.rs               # 全局鼠标钩子：划词检测 → 根据 text_select_behavior 触发
│   ├── hotkey.rs                   # 全局快捷键注册与事件分发
│   ├── tray.rs                     # 系统托盘菜单
│   ├── clipboard.rs                # 剪贴板监听
│   ├── server.rs                   # HTTP API 服务（外部调用，默认端口 60828）
│   ├── phrases.rs                  # 常用语数据
│   ├── vault.rs                    # 密码本
│   ├── backup.rs                   # 备份与恢复
│   ├── lang_detect.rs              # 本地语种检测
│   ├── system_ocr.rs               # 系统原生 OCR（Windows.Media.OCR / Apple Vision）
│   ├── screenshot.rs               # 截图功能
│   ├── updater.rs                  # 自动更新检查
│   └── error.rs                    # 统一错误类型
│
├── public/                         # 静态资源（图标等）
├── package.json                    # 前端依赖（React 18 / NextUI 2 / Vite 5）
└── src-tauri/tauri.conf.json       # Tauri 应用配置（窗口/菜单/权限）
```

# 使用说明

## 认证与登录

首次使用 Immersive Input 需要注册账号并登录：

1. **启动应用**：程序会自动打开设置窗口
2. **注册账号**：点击"注册新账号"，填写用户名、邮箱和密码（需包含数字、大小写字母，至少8位）
3. **验证邮箱**：输入邮箱收到的验证码
4. **记住密码**：勾选"记住账号"可保存登录信息（仅保存在本地设备）
5. **开始使用**：登录成功后即可使用所有功能

> 💡 密码保存在本地设备，不会上传到云端。如忘记密码，可点击"忘记密码"通过邮箱重置。
## 支付双方案（sub2apipay 默认生效）

项目已内置统一支付网关，支持两套后端实现并通过环境变量切换：

- 方案 A（默认生效）：`sub2apipay`
- 方案 B（完整预置，默认关闭）：`custom_orchestrator`（自定义编排层 + 适配器）

### 核心开关

- `PAYMENT_ACTIVE_BACKEND=sub2apipay`（默认）
- `PAYMENT_ENABLE_CUSTOM_ORCHESTRATOR=false`（默认）

当 `PAYMENT_ACTIVE_BACKEND=custom_orchestrator` 且 `PAYMENT_ENABLE_CUSTOM_ORCHESTRATOR=true` 时，才会真正切到方案 B。

### sub2apipay 相关配置

- `SUB2APIPAY_BASE_URL`
- `SUB2APIPAY_API_TOKEN`
- `SUB2APIPAY_CREATE_ORDER_PATH`（默认 `/api/orders`）
- `SUB2APIPAY_QUERY_ORDER_PATH`（默认 `/api/orders/{orderId}`）
- `SUB2APIPAY_NOTIFY_URL`
- `SUB2APIPAY_RETURN_URL`
- `SUB2APIPAY_WEBHOOK_SECRET`

### 自定义编排层（方案 B）相关配置

- `CUSTOM_ORCHESTRATOR_ADAPTER`（默认 `noop`）
- `CUSTOM_ORCHESTRATOR_WEBHOOK_SECRET`
- `CUSTOM_ORCHESTRATOR_PLACEHOLDER_CHECKOUT_URL`

### 支付 API 入口

- `GET /api/payment/config`：查看当前生效后端与开关状态
- `POST /api/payment/create-order`：创建支付订单（统一入口）
- `GET|POST /api/payment/order-status`：查询并同步订单状态
- `POST /api/payment/webhook?provider=sub2apipay|custom_orchestrator`：支付回调入口

### 会员与计费模型（已内置）

- `billing_profiles`：会员档位、订阅到期、每日额度、积分余额、累计用量
- `billing_usage_events`：每次扣费/扣额度记录（支持 `user_id + idempotency_key` 幂等）
- `billing_ledger_entries`：充值/订阅发放与用量账本（支付发放使用 `grant_key` 幂等）

支付订单进入 `PAID/COMPLETED` 后会触发计费发放：

- `orderType=subscription`：按 `productCode` 升级/续期会员
- 其他订单：按金额换算积分（`BILLING_TOPUP_CREDITS_PER_CNY`）
- 发放成功后订单会从 `PAID` 自动推进到 `COMPLETED`，重复回调不会重复入账

### 计费配置项

- `BILLING_FREE_DAILY_QUOTA`：免费档每日额度（默认 20）
- `BILLING_TOPUP_CREDITS_PER_CNY`：每 1 元兑换积分（默认 100）
- `BILLING_ALLOW_CREDIT_FALLBACK`：每日额度耗尽后是否允许扣积分（默认 `true`）

### 会员与计费 API

- `GET|POST /api/billing/profile`：查询用户计费档案（`userId`）
- `POST /api/billing/consume`：扣减使用量（支持 `X-Idempotency-Key`）
- `POST /api/billing/grant`：按支付订单补发（或重放）权益（`orderId`）

### 支付接入教程（端到端）

1. 准备环境变量  
   复制 `payment.env.example`，至少配置：
   - `PAYMENT_ACTIVE_BACKEND`
   - `SUB2APIPAY_BASE_URL` / `SUB2APIPAY_API_TOKEN`
   - `SUB2APIPAY_NOTIFY_URL`（指向你的 `/api/payment/webhook?provider=sub2apipay`）
   - `SUB2APIPAY_WEBHOOK_SECRET`
2. 启动服务后先确认网关状态  
   `GET /api/payment/config`，应看到 `activeBackend=sub2apipay`（或你期望的方案）
3. 创建订单  
   `POST /api/payment/create-order`，建议带 `idempotencyKey`，返回 `order.id` 与 `checkoutUrl`
4. 拉起支付页完成支付  
   使用返回的 `checkoutUrl` 打开收银台，用户完成付款
5. 接收回调并验签  
   支付平台回调 `POST /api/payment/webhook?...`，系统会幂等更新订单并自动发放会员/积分
6. 主动查询最终状态  
   轮询 `GET|POST /api/payment/order-status`，看到 `order.status=COMPLETED` 代表已完成发放
7. 查询会员档案核对权益  
   `GET /api/billing/profile?userId=...` 检查 `tier` / `subscriptionExpiresAt` / `bonusCredits`
8. 验证用量扣减  
   `POST /api/billing/consume`（同一个 `idempotencyKey` 重放），确认不会重复扣减

#### 示例请求

```bash
curl -X POST "http://127.0.0.1:3000/api/payment/create-order" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: pay_u001_20260408_001" \
  -d '{
    "userId":"u001",
    "orderType":"topup",
    "amount":29.9,
    "currency":"CNY",
    "productCode":"membership_topup",
    "description":"membership topup"
  }'
```

```bash
curl "http://127.0.0.1:3000/api/billing/profile?userId=u001"
```

```bash
curl -X POST "http://127.0.0.1:3000/api/billing/consume" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: usage_u001_20260408_001" \
  -d '{
    "userId":"u001",
    "units":1,
    "source":"ai"
  }'
```

### 方案切换（A/B）

保持当前生产路径（方案 A）：

- `PAYMENT_ACTIVE_BACKEND=sub2apipay`
- `PAYMENT_ENABLE_CUSTOM_ORCHESTRATOR=false`

切换到方案 B（预置完整实现）：

- `PAYMENT_ACTIVE_BACKEND=custom_orchestrator`
- `PAYMENT_ENABLE_CUSTOM_ORCHESTRATOR=true`
- 按需设置 `CUSTOM_ORCHESTRATOR_ADAPTER`

### 自动化测试

已提供 Node 内置测试（无需额外测试框架）：

- `tests/payment-core.test.mjs`：支付开关、状态归一化、状态机转移
- `tests/billing-engine.test.mjs`：额度扣减、积分回退、订阅发放、充值换算
- `tests/billing-service.test.mjs`：计费服务幂等与支付发放行为（内存存储模拟）

运行：

```bash
pnpm test
```

## 快速开始

首次使用前，请先在「偏好设置」中配置相关服务：

1. **翻译服务**：在「服务设置 → 翻译」中启用和配置翻译接口
2. **AI 功能**：在「AI 功能」中配置 API URL、API Key 和模型
3. **快捷键**：在「快捷键设置」中自定义各功能的快捷键

## 核心功能

### 划词翻译

**触发方式：**
- **快捷键**：选中文本后，按下设置的划词翻译快捷键（需在偏好设置中配置）
- **浮动工具栏**：如果启用了浮动工具栏，选中文本后会自动显示工具栏，点击「翻译」按钮

**功能说明：**

鼠标选中需要翻译的文本，按下快捷键即可启动翻译窗口。

- 支持多个翻译接口并行显示结果
- 可自定义翻译服务的优先级和显示顺序
- 支持语言自动检测
- 翻译结果可复制、朗读、收藏到生词本

**配置选项：**
- 在「偏好设置 → 快捷键设置」中设置划词翻译快捷键
- 在「偏好设置 → 翻译设置」中配置是否显示浮动工具栏

### 输入翻译

**触发方式：**
- **快捷键**：按下设置的输入翻译快捷键（需在偏好设置中配置）
- **托盘菜单**：右键点击系统托盘图标，选择「输入翻译」

**功能说明：**

按下快捷键呼出翻译窗口，输入待翻译文本后按下回车即可翻译。

- 支持语言自动检测和目标语言切换
- 可快速切换源语言和目标语言
- 支持历史记录查看
- 窗口位置可配置（跟随鼠标或固定位置）

### 轻 AI 润色

**触发方式：**
- **快捷键**：选中文本后，按下设置的轻 AI 快捷键（需在偏好设置中配置）
- **浮动工具栏**：选中文本后，在浮动工具栏中点击「轻AI」按钮
- **托盘菜单**：右键点击系统托盘图标，选择「轻AI润色」

**功能说明：**

选中文本后触发，AI 自动生成多个润色版本。

- 提供多种润色风格：缩写、扩写、纠错、改正式、改口语等
- 支持自定义附加要求，精准控制润色方向
- 一键应用到原输入框，无缝衔接工作流程
- 支持快捷指令模板，快速选择常用润色需求
- 可对单个版本进行精炼调整

**前置条件：**
- 需要在「偏好设置 → AI 功能」中配置 API URL、API Key 和模型

## 高级功能

### 浮动工具栏

**触发方式：**
- **自动显示**：选中文本后自动显示

**功能说明：**

选中文本后自动显示浮动工具栏，提供快速访问入口。根据选中内容类型，还会自动插入智能按钮（链接打开、邮件发送、路径打开、数学计算、颜色预览）。

- 可配置显示的功能按钮（翻译、轻AI、解析、格式化）
- **支持按钮拖拽排序**：在「划词设置」中调整按钮顺序
- 工具栏位置自动跟随鼠标，智能避免遮挡屏幕边缘

**配置选项：**
- 在「偏好设置 → 划词设置」中配置划词行为：
  - **显示工具栏**：划词后弹出工具栏，点击对应按钮触发功能
  - **直接翻译**：划词后直接打开翻译窗口
  - **禁用**：划词后无任何弹出

### 剪切板监听模式

**触发方式：**
- **托盘菜单**：右键点击系统托盘图标，勾选「监听剪切板」

**功能说明：**

启动后，复制文字即可自动完成翻译。

- 自动翻译剪切板中的文本内容
- 无需手动触发，提高工作效率
- 可随时开启或关闭监听模式
- 翻译结果显示在翻译窗口中

### 截图 OCR

**触发方式：**
- **快捷键**：按下设置的截图 OCR 快捷键（需在偏好设置中配置）
- **托盘菜单**：右键点击系统托盘图标，选择「文字识别」

**功能说明：**

按下快捷键后框选需要识别区域即可完成文字识别。

- 支持多种 OCR 引擎，包括系统 OCR 和在线服务
- 识别结果可直接编辑和复制
- 支持二维码识别
- 支持 LaTeX 公式识别

### 截图翻译

**触发方式：**
- **快捷键**：按下设置的截图翻译快捷键（需在偏好设置中配置）
- **托盘菜单**：右键点击系统托盘图标，选择「截图翻译」

**功能说明：**

按下快捷键后框选需要识别区域，识别后自动翻译。

- 识别后自动翻译，一步到位
- 支持多种语言识别和翻译
- 可选择不同的 OCR 和翻译服务组合

### 文本解释

**触发方式：**
- **浮动工具栏**：选中文本后，在浮动工具栏中点击「解释」按钮

**功能说明：**

选中文本后触发，AI 对选中内容进行深度解释和分析。

- 提供详细的背景知识和概念解释
- 支持自定义解释提示词，适应不同场景需求
- 支持追问功能，深入了解相关内容
- 解释结果可复制保存

**前置条件：**
- 需要在「偏好设置 → AI 功能」中配置 API URL、API Key 和模型

### AI 对话

**触发方式：**
- **浮动工具栏**：选中文本后，在浮动工具栏中点击「对话」按钮
- **托盘菜单**：右键点击系统托盘图标，选择「AI 对话」

**功能说明：**

基于选中文本开启 AI 对话，支持上下文连续对话。

- 支持 OpenAI、Gemini Pro、智谱 AI、Ollama 等多种 AI 模型
- 保持对话上下文，实现连续交流
- 支持 Markdown 格式渲染
- 可随时清空对话历史重新开始

**前置条件：**
- 需要在「偏好设置 → AI 功能」中配置 API URL、API Key 和模型

<div align="center">

# 特色功能

</div>

### 翻译功能

- 多接口并行翻译 - 同时使用多个翻译服务，对比结果选择最佳翻译
- 支持 20+ 翻译接口，包括 OpenAI、DeepL、Google、百度等
- 语言自动检测，智能识别源语言
- 支持词典查询，提供详细的词汇解释

### 文字识别 (OCR)

- 多接口文字识别 - 支持系统 OCR、Tesseract、百度、腾讯等多种引擎
- 截图 OCR - 框选屏幕区域即可识别文字
- 图片翻译 - 识别图片中的文字并自动翻译
- LaTeX 公式识别 - 识别数学公式并转换为 LaTeX 格式
- 二维码识别 - 快速识别和解析二维码内容

### AI 增强功能

- **轻 AI 润色** - 一键生成多个文本优化版本（缩写、扩写、纠错、改正式、改口语等）
- **AI 文本解释** - 深度解释选中文本，支持自定义提示词
- **AI 对话** - 基于选中文本开启智能对话，支持上下文连续交流
- 支持多种 AI 模型：OpenAI、Gemini Pro、智谱 AI、Ollama（离线）

### 辅助功能

- **浮动工具栏** - 选中文本后快速访问各项功能
- **剪切板监听** - 自动翻译复制的文本
- **语音合成** - 朗读翻译结果，支持多种语言
- **生词本** - 导出到 Anki、欧路词典等工具
- **历史记录** - 保存翻译和 AI 操作历史
- **外部调用** - 通过 HTTP API 被其他软件调用

### 系统支持

- 支持插件系统 - 通过插件扩展更多功能
- 支持所有 PC 平台 (Windows, macOS, Linux)
- 支持 Wayland (在 KDE、Gnome 以及 Hyprland 上测试)
- 多语言界面支持
- 代理支持 - 可配置 HTTP/HTTPS 代理

<div align="center">

# 支持接口

</div>

## 翻译

-   [x] [OpenAI](https://platform.openai.com/)
-   [x] [智谱 AI (ChatGLM)](https://www.zhipuai.cn/)
-   [x] [Gemini Pro](https://gemini.google.com/)
-   [x] [Ollama](https://www.ollama.com/) (离线)
-   [x] [阿里翻译](https://www.aliyun.com/product/ai/alimt)
-   [x] [百度翻译](https://fanyi.baidu.com/)
-   [x] [百度领域翻译](https://fanyi.baidu.com/)
-   [x] [彩云小译](https://fanyi.caiyunapp.com/)
-   [x] [腾讯翻译君](https://fanyi.qq.com/)
-   [x] [腾讯交互翻译](https://transmart.qq.com/)
-   [x] [火山翻译](https://translate.volcengine.com/)
-   [x] [小牛翻译](https://niutrans.com/)
-   [x] [Google](https://translate.google.com)
-   [x] [Bing](https://learn.microsoft.com/zh-cn/azure/cognitive-services/translator/)
-   [x] [Bing 词典](https://www.bing.com/dict)
-   [x] [DeepL](https://www.deepl.com/)
-   [x] [有道翻译](https://ai.youdao.com/)
-   [x] [剑桥词典](https://dictionary.cambridge.org/)
-   [x] [Yandex](https://translate.yandex.com/)
-   [x] [Lingva](https://github.com/TheDavidDelta/lingva-translate)
-   [x] [ECDICT](https://github.com/skywind3000/ECDICT) (离线词典)

更多接口支持见 [插件系统](#插件系统)

## 文字识别

-   [x] 系统 OCR (离线)
    -   [x] [Windows.Media.OCR](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr.ocrengine?view=winrt-22621) on Windows
    -   [x] [Apple Vision Framework](https://developer.apple.com/documentation/vision/recognizing_text_in_images) on MacOS
    -   [x] [Tesseract OCR](https://github.com/tesseract-ocr) on Linux
-   [x] [Tesseract.js](https://tesseract.projectnaptha.com/) (离线)
-   [x] [百度通用 OCR](https://ai.baidu.com/tech/ocr/general)
-   [x] [百度高精度 OCR](https://ai.baidu.com/tech/ocr/general)
-   [x] [百度图片翻译](https://fanyi-api.baidu.com/product/22)
-   [x] [腾讯通用 OCR](https://cloud.tencent.com/product/ocr-catalog)
-   [x] [腾讯高精度 OCR](https://cloud.tencent.com/product/ocr-catalog)
-   [x] [腾讯图片翻译](https://cloud.tencent.com/document/product/551/17232)
-   [x] [火山通用 OCR](https://www.volcengine.com/product/OCR)
-   [x] [火山多语言 OCR](https://www.volcengine.com/product/OCR)
-   [x] [讯飞通用 OCR](https://www.xfyun.cn/services/common-ocr)
-   [x] [讯飞手写 OCR](https://www.xfyun.cn/services/common-ocr)
-   [x] [讯飞 LaTeX OCR](https://www.xfyun.cn/services/formula-discern)
-   [x] [Simple LaTeX](https://simpletex.cn/)
-   [x] 二维码识别

更多接口支持见 [插件系统](#插件系统)

## 语音合成

-   [x] [Lingva](https://github.com/thedaviddelta/lingva-translate)

更多接口支持见 [插件系统](#插件系统)

## 生词本

-   [x] [Anki](https://apps.ankiweb.net/)
-   [x] [欧路词典](https://dict.eudic.net/)

更多接口支持见 [插件系统](#插件系统)

<div align="center">

# 插件系统

</div>

软件内置接口数量有限，但是您可以通过插件系统来扩展软件的功能。

## 插件安装

immersive-input 插件的扩展名为 `.potext`，下载得到 `.potext` 文件之后，在 偏好设置-服务设置-添加外部插件-安装外部插件 选择对应的 `.potext` 即可安装成功，添加到服务列表中即可像内置服务一样正常使用了。

### 故障排除

-   找不到指定的模块 (Windows)

    出现类似这样的报错是因为系统缺少 C++ 库，前往[这里](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170#visual-studio-2015-2017-2019-and-2022)安装即可解决问题。

-   不是有效的 Win32 应用程序 (Windows)

    出现类似这样的报错说明你没有下载对应系统或者架构的插件，请下载正确的插件即可解决问题。

## 插件开发

插件开发需要遵循特定的接口规范，具体的开发文档请参考项目源码中的插件模板。

<div align="center">

# 安装指南

</div>

## Windows

### 手动安装

1. 从 Release 页面下载最新 `exe` 安装包。

    - 64 位机器下载 `immersive-input_{version}_x64-setup.exe`
    - 32 位机器下载 `immersive-input_{version}_x86-setup.exe`
    - arm64 机器下载 `immersive-input_{version}_arm64-setup.exe`

2. 双击安装包进行安装。

### 故障排除

-   启动后没有界面，点击托盘图标没有反应

    检查是否卸载/禁用了 WebView2，如果卸载/禁用了 WebView2，请手动安装 WebView2 或将其恢复。

    如果是企业版系统不方便安装或无法安装 WebView2，请尝试下载内置 WebView2 的版本 `immersive-input_{version}_{arch}_fix_webview2_runtime-setup.exe`

    若问题仍然存在请尝试使用 Windows7 兼容模式启动。

## MacOS

### 手动安装

1. 从 Release 页面下载最新的 `dmg` 安装包。（如果您使用的是 M1/M2 芯片，请下载名为 `immersive-input_{version}_aarch64.dmg` 的安装包，否则请下载名为 `immersive-input_{version}_x64.dmg` 的安装包）
2. 双击下载的文件后将 immersive-input 拖入 Applications 文件夹即可完成安装。

### 故障排除

-   由于开发者无法验证，"immersive-input"无法打开。

    点击 取消 按钮，然后去 设置 -> 隐私与安全性 页面，点击 仍要打开 按钮，然后在弹出窗口里点击 打开 按钮即可，以后打开 immersive-input 就再也不会有任何弹窗告警了

    如果在 隐私与安全性 中找不到以上选项，或启动时提示文件损坏。打开 Terminal.app，并输入以下命令，然后重启 immersive-input 即可：

    ```bash
    sudo xattr -d com.apple.quarantine /Applications/immersive-input.app
    ```

-   如果每次打开时都遇到辅助功能权限提示，或者无法进行划词翻译，请前往设置 -> 隐私与安全 -> 辅助功能，移除 "immersive-input"，并重新添加 "immersive-input"。

## Linux

### Debian/Ubuntu

1. 从 Release 页面下载最新的对应架构的 `deb` 安装包。

2. 使用 `apt-get` 进行安装

    ```bash
    sudo apt-get install ./immersive-input_{version}_amd64.deb
    ```

### Arch/Manjaro

> [!WARNING]
> 在最新版本的 [Webkit2Gtk](https://archlinux.org/packages/extra/x86_64/webkit2gtk) (2.42.0) 中，由于 Nvidia 专有驱动未完全实现 DMABUF，将导致无法启动和崩溃的情况发生。<br>
> 请降级或在 `/etc/environment` （或者其他设置环境变量的地方）中加入 `WEBKIT_DISABLE_DMABUF_RENDERER=1` 环境变量关闭 DMABUF 的使用。

如果有对应的 AUR 包，可使用 `AUR helper` 安装：

```bash
yay -S immersive-input
```

<div align="center">

# 外部调用

</div>

Immersive Input 提供了完整的 HTTP 接口，以便可以被其他软件调用。您可以通过向 `127.0.0.1:port` 发送 HTTP 请求来调用，其中的 `port` 是监听的端口号，默认为 `60828`，可以在软件设置中进行更改。

## API 文档:

```bash
POST "/" => 翻译指定文本(body为需要翻译的文本),
GET "/config" => 打开设置,
POST "/translate" => 翻译指定文本(同"/"),
GET "/selection_translate" => 划词翻译,
GET "/input_translate" => 输入翻译,
GET "/ocr_recognize" => 截图OCR,
GET "/ocr_translate" => 截图翻译,
GET "/ocr_recognize?screenshot=false" => 截图OCR(不使用软件内截图),
GET "/ocr_translate?screenshot=false" => 截图翻译(不使用软件内截图),
GET "/ocr_recognize?screenshot=true" => 截图OCR,
GET "/ocr_translate?screenshot=true" => 截图翻译,
```

## 示例：

-   调用划词翻译：

    如果想要调用划词翻译，只需向 `127.0.0.1:port` 发送请求即可。

    例如通过 curl 发送请求：

    ```bash
    curl "127.0.0.1:60828/selection_translate"
    ```

## 不使用软件内截图

这一功能可以让您在不使用软件内截图的情况下调用截图 OCR/截图翻译功能，这样您就可以使用您喜欢的截图工具来截图了，也可以解决在某些平台下自带的截图无法使用的问题。

### 调用流程

1. 使用其他截图工具截图
2. 将截图保存在 `$CACHE/com.immersive-input.desktop/immersive_screenshot_cut.png`
3. 向 `127.0.0.1:port/ocr_recognize?screenshot=false` 发送请求即可调用成功

> `$CACHE` 为系统缓存目录，例如在 Windows 上为 `C:\Users\{用户名}\AppData\Local\com.immersive-input.desktop\immersive_screenshot_cut.png`

### 示例

在 Linux 下调用 Flameshot 进行截图 OCR:

```bash
rm ~/.cache/com.immersive-input.desktop/immersive_screenshot_cut.png && flameshot gui -s -p ~/.cache/com.immersive-input.desktop/immersive_screenshot_cut.png && curl "127.0.0.1:60828/ocr_recognize?screenshot=false"
```

<div align="center">

# Wayland 支持

</div>

由于各大发行版对于 Wayland 的支持程度不同，所以 immersive-input 本身没法做到特别完美的支持，这里可以提供一些常见问题的解决方案，通过合理的设置之后，immersive-input 也可以在 Wayland 下完美运行。

## 快捷键无法使用

由于 Tauri 的快捷键方案并没有支持 Wayland，所以应用内的快捷键设置在 Wayland 下无法使用。您可以设置系统快捷键用 curl 发送请求来触发，详见[外部调用](#外部调用)

## 截图无法使用

在一些纯 Wayland 桌面环境/窗口管理器(如 Hyprland)上，内置的截图无法使用，这时可以通过使用其他截图工具代替，详见 [不使用软件内截图](#不使用软件内截图)

下面给出在 Hyprland 下的配置示例(通过 grim 和 slurp 实现截图)：

```conf
bind = ALT, X, exec, grim -g "$(slurp)" ~/.cache/com.immersive-input.desktop/immersive_screenshot_cut.png && curl "127.0.0.1:60828/ocr_recognize?screenshot=false"
bind = ALT, C, exec, grim -g "$(slurp)" ~/.cache/com.immersive-input.desktop/immersive_screenshot_cut.png && curl "127.0.0.1:60828/ocr_translate?screenshot=false"
```

其他桌面环境/窗口管理器也是类似的操作

## 划词翻译窗口跟随鼠标位置

由于目前在 Wayland 下还无法获取到正确的鼠标坐标，所以内部的实现无法工作。对于某些桌面环境/窗口管理器，可以通过设置窗口规则来实现窗口跟随鼠标位置，这里以 Hyprland 为例：

```conf
windowrulev2 = float, class:(immersive-input), title:(Translator|OCR|PopClip|Screenshot Translate) # Translation window floating
windowrulev2 = move cursor 0 0, class:(immersive-input), title:(Translator|PopClip|Screenshot Translate) # Translation window follows the mouse position.
```

<div align="center">

# 手动编译

</div>

### 环境要求

Node.js >= 18.0.0

pnpm >= 8.5.0

Rust >= 1.80.0

### 开始编译

1. Clone 仓库

    ```bash
    git clone https://github.com/your-repo/immersive-input.git
    ```

2. 安装依赖

    ```bash
    cd immersive-input
    pnpm install
    ```

3. 安装依赖(仅 Linux 需要)

    ```bash
    sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.0-dev libayatana-appindicator3-dev librsvg2-dev patchelf libxdo-dev libxcb1 libxrandr2 libdbus-1-3
    ```

4. 开发调试

    ```bash
    pnpm tauri dev
    ```

5. 打包构建
    ```bash
    pnpm tauri build
    ```

<div align="center">
# 开发注意事项 / 已知技术卡点

</div>

本节记录开发过程中踩过的关键坑，便于后续维护和新功能开发时规避，也便于复用已有解决思路。

## ⚠️ 卡点 1：Tauri 命令线程中 `WindowBuilder::build()` 死锁（Windows / WebView2）

### 现象

点击浮动工具栏按钮后，日志停在：

```text
Window not existence, Creating new window: translate
```

之后完全卡死，无任何后续日志，翻译窗口永远不出现。

### 根本原因

在 Windows 上，Tauri 同步命令（`#[tauri::command]`）的处理函数运行在 **WebView2 IPC 事件线程**上。

当该线程调用 `WindowBuilder::build()` 时，会形成如下循环等待：

```text
WebView2 IPC 线程
  → 执行 Tauri 命令处理函数
    → build() 需要创建新的 WebView2 控制器
      → 需要 WebView2 消息循环处理“创建窗口”事件
        → 但消息循环正在等待 IPC 命令返回
          → 循环等待，永久卡死
```

`float_toolbar_window()` 之所以正常，是因为它来自 `mouse_hook` 中的 `std::thread::spawn`，不是在 WebView2 IPC 命令线程中执行。

### 修复方案

**在 Tauri 命令处理函数中，把窗口创建逻辑移动到 `std::thread::spawn` 的独立线程中执行。**

```rust
// ❌ 错误写法：直接在命令线程中创建窗口
#[tauri::command]
pub fn open_translate_from_toolbar() {
    let window = translate_window();
    window.emit("new_text", text).unwrap_or_default();
}

// ✅ 正确写法：先读取共享状态，再在独立线程中创建窗口
#[tauri::command]
pub fn open_translate_from_toolbar() {
    let text = { /* 在命令线程中读取 state */ };
    std::thread::spawn(move || {
        let window = translate_window();
        window.emit("new_text", text).unwrap_or_default();
    });
}
```

### 适用规则

- 凡是 `#[tauri::command]` 中可能触发 `WindowBuilder::build()` 的逻辑，**优先考虑放入 `std::thread::spawn`**
- 先在命令线程中读取共享状态，再把真正的窗口创建放到独立线程，避免锁和 IPC 线程相互阻塞

### 涉及文件

- `src-tauri/src/window.rs`

---

## ⚠️ 卡点 2：`current_monitor().unwrap().unwrap()` 在新建不可见窗口上 panic

### 现象

窗口创建过程中无明显错误日志，但窗口不出现，或者应用直接 panic。

### 根本原因

很多窗口是通过 `.visible(false)` 创建的。此时系统尚未把该窗口关联到具体显示器，`current_monitor()` 可能返回 `Ok(None)`。

如果直接使用：

```rust
let monitor = window.current_monitor().unwrap().unwrap();
```

第二个 `unwrap()` 会直接 panic。

### 修复方案

统一使用带 fallback 的安全封装函数：

```rust
fn get_window_monitor(window: &Window) -> Monitor {
    window.current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| get_daemon_window().primary_monitor().ok().flatten())
        .expect("No monitor found for window")
}
```

### 适用规则

- **不要** 在窗口创建初期直接使用 `current_monitor().unwrap().unwrap()`
- 对不可见窗口、刚创建的窗口、尚未 show 的窗口，始终使用安全 fallback

### 涉及文件

- `src-tauri/src/window.rs`

---

## ⚠️ 卡点 3：浮动工具栏里的 `invoke()` 不能 `await`

### 现象

工具栏点击按钮后，如果前端写成：

```js
await invoke('open_translate_from_toolbar');
```

则可能再次触发窗口创建卡死，或者前端表现为按钮点击后无响应。

### 根本原因

`await invoke()` 会让当前 WebView2 IPC 调用链等待 Rust 返回；而 Rust 侧如果又开始创建新窗口，就会重新依赖 WebView2 消息循环，从而和卡点 1 形成同源问题。

### 修复方案

对于“打开窗口”类按钮，使用 **fire-and-forget** 调用方式：

```js
// ❌ 错误
await invoke('open_translate_from_toolbar');
hide();

// ✅ 正确
invoke('open_translate_from_toolbar').catch(() => {});
await delay(80);
hide();
```

### 适用规则

- 只要是“点击工具栏按钮 → 打开其他窗口”的逻辑，`invoke()` **不要 await**
- 时序建议：**先 `invoke()`，再短暂 `delay()`，最后 `hide()`**

### 涉及文件

- `src/window/FloatToolbar/index.jsx`

---

## ⚠️ 卡点 4：浮动工具栏按钮与具体业务逻辑不要强耦合

### 现象

如果把所有按钮逻辑都塞进一个巨大的 `handleClick` 里，后续加按钮、改时序、修特殊平台 bug 都会非常难维护。

### 修复方案

将浮动工具栏拆成两层：

1. **显示配置层**
   - `BASE_BUTTONS`
   - `SMART_BUTTON_MAP`
2. **行为配置层**
   - `BUTTON_ACTIONS`

工具栏组件本身只做：

- 渲染按钮
- 读取当前选中文字
- 根据 `id` 分发到对应 action

而不直接关心“翻译/解释/轻 AI/打开链接/格式化”的具体业务细节。

### 推荐模式

```js
const BUTTON_ACTIONS = {
  translate: async (_text, { hide }) => {
    invoke('open_translate_from_toolbar').catch(() => {});
    await delay(80);
    hide();
  },
  explain: async (_text, { hide }) => {
    invoke('open_explain_window').catch(() => {});
    await delay(80);
    hide();
  },
};

const handleClick = useCallback(async (id) => {
  const action = BUTTON_ACTIONS[id];
  if (!action) return;
  await action(text, ctx);
}, [text, ctx]);
```

### 适用规则

- 新增工具栏按钮时，优先新增 `BUTTON_ACTIONS[id]`
- 工具栏组件只负责“分发”，不要再堆积 if-else
- 不同按钮允许不同的时序策略（例如：先 `invoke` 后 `hide`、先 `hide` 后 `invoke`、保持工具栏打开显示 inline 结果）

---

<div align="center">

# 感谢

</div>

-   [Pot](https://github.com/pot-app/pot-desktop) 项目基础
-   [Bob](https://github.com/ripperhe/Bob) 灵感来源
-   [Tauri](https://github.com/tauri-apps/tauri) 优秀的 GUI 框架

<div align="center">

