# FlowGuideAI 中央集成

FlowGuideAI（`https://ai.flowguide.cc`）是本项目统一使用的账号、计费、支付、API Key 和 AI 用量网关。

## 运行边界

- 产品页面和桌面窗口继续由当前项目负责。
- 用户的真实身份由 FlowGuideAI 认证服务签发。
- 计费档案、余额、套餐、充值、支付订单、邀请码和用量数据均以 FlowGuideAI API 返回的数据为准。
- AI 请求默认使用 FlowGuideAI 的 OpenAI 兼容网关。
- 当前项目中的本地认证、计费、支付和邀请服务代码只作为兼容代码保留，不应继续扩展为独立的商业系统。

## 默认接口

- 认证基础地址：`https://ai.flowguide.cc`
- 登录：`/api/v1/auth/login`
- 注册：`/api/v1/auth/register`
- 发送验证码：`/api/v1/auth/send-verify-code`
- 忘记密码：`/api/v1/auth/forgot-password`
- 重置密码：`/api/v1/auth/reset-password`
- 计费档案：`/api/billing/profile`
- 计费目录：`/api/billing/catalog`
- 支付配置：`/api/payment/config`
- 创建支付订单：`/api/payment/create-order`
- AI 对话网关：`/v1/chat/completions`
- AI 语音网关：`/v1/audio/speech`

## 可选环境变量覆盖

只有在 FlowGuideAI 的域名或接口路径发生变化时，才需要配置以下变量。

```env
VITE_FLOWGUIDE_API_BASE=https://ai.flowguide.cc
VITE_FLOWGUIDE_AUTH_BASE=https://ai.flowguide.cc
VITE_FLOWGUIDE_AI_GATEWAY_BASE=https://ai.flowguide.cc
VITE_FLOWGUIDE_CHAT_COMPLETIONS_URL=https://ai.flowguide.cc/v1/chat/completions
VITE_FLOWGUIDE_AUDIO_SPEECH_URL=https://ai.flowguide.cc/v1/audio/speech
VITE_FLOWGUIDE_AUTH_LOGIN_PATH=/api/v1/auth/login
VITE_FLOWGUIDE_AUTH_REGISTER_PATH=/api/v1/auth/register
VITE_FLOWGUIDE_AUTH_SEND_CODE_PATH=/api/v1/auth/send-verify-code
VITE_FLOWGUIDE_AUTH_FORGOT_PASSWORD_PATH=/api/v1/auth/forgot-password
VITE_FLOWGUIDE_AUTH_RESET_PASSWORD_PATH=/api/v1/auth/reset-password
```

## Input 订阅分组策略

当前项目的网关分组属于项目级策略，不读取 FlowGuideAI 的通用默认订阅来决定分组。请求按“最高等级有效订阅 -> 订阅额度耗尽后切余额组 -> 余额不足后停止”执行。

```env
VITE_INPUT_FREE_PLAN_ID=4
VITE_INPUT_FREE_GROUP_ID=9
VITE_SUB2API_BALANCE_GROUP_ID=17
```

配置说明：

- `VITE_INPUT_FREE_PLAN_ID`：当前项目 Input 免费计划 ID，默认是 `4`。
- `VITE_INPUT_FREE_GROUP_ID`：当前项目 Input 免费分组 ID，默认是 `9`。
- `VITE_SUB2API_BALANCE_GROUP_ID`：余额按量分组 ID。只有该分组存在、处于启用状态且不是订阅分组时，订阅耗尽后的余额回退才会启用。
- `VITE_INPUT_FORCE_FREE_GATEWAY`：兼容旧的强制免费分组策略，只有显式设置为 `true` 时启用；正常生产环境保持未设置。

严格策略只作用于网关请求：客户端只会复用或创建绑定到目标分组的 Key；目标分组不可用、接口返回错误分组或无法确认余额分组时，直接报错，不回退到其他 FlowGuideAI 订阅。所有套餐都可以配置自定义 AI 服务；已填写完整自定义 `API URL` 和 `API Key` 的请求直接走用户自己的服务，不消耗 FlowGuideAI 订阅额度或余额。自定义 URL 缺少用户自己的 API Key 时会被配置校验拦截，不会由平台代付。

自动分配接口仍需要 FlowGuideAI 侧存在对应计划和分组，并配置 `FLOWGUIDE_ADMIN_TOKEN`。前端环境变量会在构建时注入，修改后必须重新构建和部署。

## Vercel 环境迁移

旧的 Vercel 部署中可能仍然存在自编排认证、支付、计费、邀请、邮件和 Supabase 后端所需的大量变量。完成 FlowGuideAI 中央化后，按以下方式处理这些变量。

### 保留在当前项目 Vercel

当前项目只保留产品外壳运行所需的变量。

```env
VITE_FLOWGUIDE_API_BASE=https://ai.flowguide.cc
VITE_FLOWGUIDE_AI_GATEWAY_BASE=https://ai.flowguide.cc
VITE_APP_BASE_URL=https://your-product.example.com
```

如果 FlowGuideAI 的接口路径没有变化，上面的路径覆盖变量也不需要配置。

### 迁移至 FlowGuideAI Vercel

支付和商业系统密钥属于 FlowGuideAI/Sub2API 部署，不属于当前产品部署。

- `STRIPE_*`
- `ALIPAY_*`
- `WXPAY_*`
- `EASYPAY_*`
- `CUSTOM_ORCHESTRATOR_*`
- `PAYMENT_PROVIDERS`
- `PAYMENT_ADMIN_TOKEN`
- `BILLING_*`
- `INVITE_*`
- `RESEND_*`
- `OTP_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

### 在当前项目中删除或保持未设置

确认生产流量已经切换到 FlowGuideAI 后，应从当前产品的 Vercel 项目中删除以下变量，或保持未设置。

- 指向当前产品的旧支付通知地址，例如 `ALIPAY_NOTIFY_URL`、`WXPAY_NOTIFY_URL`、`EASYPAY_NOTIFY_URL` 和 `STRIPE_WEBHOOK_SECRET`。
- 旧的直接支付渠道密钥，例如 `STRIPE_SECRET_KEY`、`ALIPAY_PRIVATE_KEY` 和 `WXPAY_PRIVATE_KEY`。
- 旧的本地计费目录变量，例如 `BILLING_TOPUP_PRESET_AMOUNTS` 和 `BILLING_PLAN_PRICE_*`。
- 旧的认证数据库和邮件变量，例如 `SUPABASE_*`、`RESEND_*` 和 `OTP_SECRET`。

### 兼容窗口

迁移期间，旧的无服务器路由可以继续部署，但不应再接收新的生产流量。只有在以下检查全部通过前，才保留这些路由用于回滚：

- 现有用户可以通过产品界面登录，并获得 FlowGuideAI 会话。
- 产品发起的 `/api/billing/profile`、`/api/billing/catalog` 和 `/api/payment/create-order` 请求均解析到 FlowGuideAI。
- 支付渠道 Webhook 已配置为 FlowGuideAI 的回调地址。
- AI 请求可以在 FlowGuideAI 用量统计中看到。
- 当前产品旧的 Vercel 函数日志中不再出现新的支付、计费、注册或消费请求。

## 旧路由退役

旧产品路由会继续保留在仓库中，但运行时已经退役。

- `api/auth.js`
- `api/billing.js`
- `api/payment.js`
- `api/admin.js`

默认行为：

- 返回 `410 Gone`。
- 返回标记路由已退役的 JSON 数据。
- 在响应中包含 FlowGuideAI 基础地址。

回滚开关：

```env
FLOWGUIDE_LEGACY_ROUTE_MODE=passthrough
```

也可以只对某一类路由启用回滚：

```env
FLOWGUIDE_LEGACY_AUTH_MODE=passthrough
FLOWGUIDE_LEGACY_BILLING_MODE=passthrough
FLOWGUIDE_LEGACY_PAYMENT_MODE=passthrough
FLOWGUIDE_LEGACY_ADMIN_MODE=passthrough
```

这些开关只用于紧急回滚。正常生产环境应保持未设置，让旧路由继续处于退役状态。

## 实现说明

- `src/utils/auth.js` 保留原有登录和注册界面契约，但请求实际发送到 FlowGuideAI。
- `src/utils/backendApi.js` 默认将计费和支付 API 请求发送到 FlowGuideAI。
- `src/utils/aiConfig.js` 默认将 AI 和 OpenAI TTS 地址设置为 FlowGuideAI 网关地址。
- 已保存的 OpenAI、Claude 和 Gemini 官方网关地址会迁移到 FlowGuideAI，并清除旧厂商 API Key。
- 如果本地没有配置 FlowGuideAI API Key，已登录用户可以使用 FlowGuideAI 会话调用 FlowGuideAI 网关。
- `server/lib/legacyRoute.js` 负责退役当前产品侧旧认证、计费、支付和管理 API。
