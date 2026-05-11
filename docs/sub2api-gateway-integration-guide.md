# Sub2API 支付与账户网关通用接入指南

本文用于指导其他产品项目接入 Sub2API 作为统一账户、余额、套餐、支付、邀请返利和 AI 用量计费网关。目标是让人和 AI 都能快速判断接入范围、字段映射和不可越界的部分。

> 当前文档基于 Sub2API `/api/v1` 路由约定，以及本项目 `Immersive-Input` 的落地经验整理。具体线上域名以部署环境为准。

## 1. 一句话边界

业务项目只负责展示、登录态保存、调用网关和发起 AI 请求；所有商业事实都以 Sub2API 为准。

商业事实包括：

- 用户身份、登录、注册、验证码、重置密码。
- 用户余额、余额充值、充值到账。
- 支付渠道、订单创建、订单状态、取消、退款。
- 套餐列表、套餐购买、订阅有效期、订阅用量进度。
- 邀请码、邀请链接、邀请统计、返利比例、返利转余额。
- AI 请求的鉴权、计费、余额消耗和用量记录。

业务项目不要再自建这些事实，也不要在本地补写一套并行逻辑。

## 2. 项目侧允许做什么

允许：

- 保留现有 UI 和交互，只替换数据源。
- 把 Sub2API 返回字段适配成项目内旧组件需要的结构。
- 在前端保存 `access_token`、`refresh_token`、用户基础信息。
- 根据网关返回的套餐动态渲染卡片。
- 根据网关返回的支付方式动态展示可用支付按钮。
- 对订单做轮询、取消、状态刷新和成功后重新拉取账户资料。
- 展示邀请链接，链接参数使用 `aff` 或网关明确要求的字段。
- 对接 OpenAI-compatible AI 网关，让 AI 消耗由 Sub2API 负责。

禁止：

- 本地生成邀请码作为真实邀请码。
- 本地计算返利金额作为真实余额。
- 本地写死套餐价格作为真实价格。
- 本地创建支付订单或绕过 Sub2API 直接连支付渠道。
- 本地监听支付 webhook 并直接给用户加余额。
- 本地扣减 AI 用量、扣余额、发放套餐权益。
- 在业务项目里保存支付渠道密钥、商户私钥、webhook secret。
- 把“积分”作为新的账户资产继续扩展；统一使用“余额”语义。

## 3. 推荐环境变量

业务项目只需要知道 Sub2API 的 API 域名和 Web 域名。

```env
VITE_SUB2API_API_BASE=https://ai.example.com/api/v1
VITE_SUB2API_WEB_BASE=https://ai.example.com
```

如项目已有中心网关变量，也可以兼容：

```env
VITE_FLOWGUIDE_REST_API_BASE=https://ai.example.com/api/v1
VITE_FLOWGUIDE_WEB_BASE=https://ai.example.com
```

不要在业务项目中配置：

```env
ALIPAY_*
WXPAY_*
STRIPE_*
EASYPAY_*
PAYMENT_ADMIN_TOKEN
BILLING_*
INVITE_*
SUPABASE_SERVICE_ROLE_KEY
```

这些属于 Sub2API 网关部署。

## 4. 通用 HTTP 约定

API base 默认是：

```text
https://ai.example.com/api/v1
```

请求头：

```http
Content-Type: application/json
Authorization: Bearer <access_token>
Accept-Language: zh-CN
```

Sub2API 常见响应 envelope：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

适配器应该统一解包：

- `code === 0`：返回 `data`。
- `code !== 0`：抛出 `message`，同时保留 `code`、`reason`、`metadata`。
- 非 JSON 响应：按 HTTP 状态抛错。
- `401`：如有 `refresh_token`，优先刷新 token，再重放业务请求。

## 5. 登录与注册

### 5.1 登录

```http
POST /auth/login
```

请求：

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

成功后保存：

- `access_token`
- `refresh_token`
- `expires_in`
- `user`

### 5.2 发送注册验证码

```http
POST /auth/send-verify-code
```

请求：

```json
{
  "email": "user@example.com"
}
```

返回里的 `countdown` 可用于前端倒计时。

### 5.3 注册

```http
POST /auth/register
```

请求：

```json
{
  "email": "user@example.com",
  "password": "password",
  "verify_code": "123456",
  "aff_code": "ABCDEF"
}
```

字段边界：

- 邀请返利码使用 `aff_code`。
- 旧项目里的 `inviteCode`、`referralCode`、`inviterId` 只能作为 UI 字段名，提交给网关前必须映射为 `aff_code`。
- 不要本地校验邀请码真实性，真实性以网关返回为准。

### 5.4 当前用户

```http
GET /user/profile
```

常用字段：

```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "user",
  "balance": 10.5,
  "role": "user",
  "status": "active",
  "subscriptions": []
}
```

项目侧账户余额展示应使用 `balance`。

## 6. 邀请返利

### 6.1 获取邀请详情

```http
GET /user/aff
```

常用字段：

```json
{
  "user_id": 1,
  "aff_code": "ABCDEF",
  "aff_count": 3,
  "aff_quota": 12.5,
  "aff_frozen_quota": 0,
  "aff_history_quota": 50,
  "effective_rebate_rate_percent": 20,
  "invitees": []
}
```

字段含义：

- `aff_code`：真实邀请码。
- `aff_count`：邀请人数。
- `aff_quota`：当前可转余额的返利额度。
- `aff_frozen_quota`：冻结中的返利额度。
- `aff_history_quota`：历史返利额度。
- `effective_rebate_rate_percent`：当前用户作为邀请人的有效返利比例。

### 6.2 邀请链接

业务项目应拼出 Web 注册页链接：

```text
https://ai.example.com/register?aff=ABCDEF
```

或者如果产品自己的注册页已经接了 Sub2API 注册接口，也可以使用：

```text
https://your-product.example.com/register?aff=ABCDEF
```

注册页读取参数顺序建议：

1. `aff`
2. `aff_code`
3. 兼容旧参数 `invite`

最终提交给 Sub2API 时统一映射成 `aff_code`。

### 6.3 返利转余额

```http
POST /user/aff/transfer
```

返回：

```json
{
  "transferred_quota": 12.5,
  "balance": 23
}
```

转入后重新拉取 `/user/profile` 和 `/user/aff`。

## 7. 套餐与订阅

### 7.1 一次性获取结账信息

```http
GET /payment/checkout-info
```

返回里通常包含：

- `methods`
- `global_min`
- `global_max`
- `plans`
- `balance_disabled`
- `balance_recharge_multiplier`
- `help_text`
- `help_image_url`
- `stripe_publishable_key`

套餐字段示例：

```json
{
  "id": 1,
  "name": "Pro Monthly",
  "description": "Pro plan",
  "price": 29.9,
  "original_price": 49.9,
  "validity_days": 30,
  "validity_unit": "day",
  "features": ["High quota", "Priority routing"],
  "for_sale": true,
  "sort_order": 10,
  "group_id": 2,
  "group_name": "pro",
  "daily_limit_usd": 5,
  "weekly_limit_usd": 20,
  "monthly_limit_usd": 80
}
```

业务项目应遵守：

- 只展示 `for_sale !== false` 的套餐。
- 按 `sort_order` 排序。
- 价格以 `price` 为准。
- 购买套餐时传 `plan_id`，不要传本地自定义 plan code 作为真实依据。
- 如果旧 UI 需要 `basic/pro/enterprise` 之类分层，只能作为展示分类，不能作为购买事实。

### 7.2 当前订阅

```http
GET /subscriptions/active
GET /subscriptions/progress
GET /subscriptions/summary
```

用法：

- `/subscriptions/active`：展示当前有效套餐。
- `/subscriptions/progress`：展示日、周、月额度使用进度。
- `/subscriptions/summary`：做账户页概览。

业务项目不要本地计算套餐是否过期，应以网关返回的 `status`、`expires_at`、`days_remaining` 为准。

## 8. 支付与余额充值

### 8.1 支付方式

`/payment/checkout-info` 的 `methods` 是支付按钮的真实来源。

常见支付类型：

- `alipay`
- `wxpay`
- `alipay_direct`
- `wxpay_direct`
- `stripe`
- `easypay`

每个 method 可能包含：

```json
{
  "daily_limit": 1000,
  "daily_used": 0,
  "daily_remaining": 1000,
  "single_min": 1,
  "single_max": 500,
  "fee_rate": 0,
  "available": true
}
```

项目侧应只展示 `available !== false` 且满足金额限制的方法。

### 8.2 创建余额充值订单

```http
POST /payment/orders
```

请求：

```json
{
  "amount": 50,
  "payment_type": "alipay",
  "order_type": "balance",
  "payment_source": "your-product",
  "return_url": "https://your-product.example.com/account",
  "is_mobile": false
}
```

关键边界：

- 充值是余额充值，`order_type` 使用 `balance`。
- 不要再使用 `credits`、`points`、`membership_topup` 作为真实订单类型。
- `amount` 是付款金额，到账余额由网关根据配置处理。

### 8.3 创建套餐订单

```http
POST /payment/orders
```

请求：

```json
{
  "amount": 29.9,
  "payment_type": "wxpay",
  "order_type": "subscription",
  "plan_id": 1,
  "payment_source": "your-product",
  "return_url": "https://your-product.example.com/account",
  "is_mobile": false
}
```

关键边界：

- `plan_id` 必须来自 `/payment/checkout-info` 的 `plans[].id`。
- `amount` 应使用该 plan 的 `price`。
- 套餐发放、续期、额度重置由网关处理。

### 8.4 创建订单返回

常用字段：

```json
{
  "order_id": 123,
  "amount": 50,
  "pay_amount": 50,
  "fee_rate": 0,
  "expires_at": "2026-05-10T12:00:00Z",
  "payment_type": "alipay",
  "out_trade_no": "P202605100001",
  "pay_url": "https://...",
  "qr_code": "https://...",
  "result_type": "order_created"
}
```

前端处理建议：

- 有 `pay_url`：打开或跳转支付页。
- 有 `qr_code`：渲染二维码。
- 有 `client_secret`：交给 Stripe 前端 SDK。
- 有 `oauth` 或 `result_type === "oauth_required"`：按网关返回的 OAuth 地址跳转。
- 有 `jsapi`：在微信环境调用 JSAPI 支付。

### 8.5 查询订单

```http
GET /payment/orders/:id
```

如回调可能延迟，可用：

```http
POST /payment/orders/verify
```

请求：

```json
{
  "out_trade_no": "P202605100001"
}
```

订单终态：

- `COMPLETED`
- `FAILED`
- `CANCELLED`
- `EXPIRED`
- `REFUNDED`
- `PARTIALLY_REFUNDED`

非终态可继续轮询：

- `PENDING`
- `PAID`
- `RECHARGING`
- `REFUND_REQUESTED`
- `REFUNDING`
- `REFUND_FAILED`

支付成功后必须重新拉取：

- `/user/profile`
- `/user/aff`
- `/subscriptions/active`
- `/subscriptions/progress`
- `/payment/checkout-info`

### 8.6 取消订单

```http
POST /payment/orders/:id/cancel
```

只对待支付订单开放。取消后重新查询订单状态。

## 9. AI 用量与余额消耗

AI 请求应该走 Sub2API 提供的 OpenAI-compatible 网关，例如：

```text
https://ai.example.com/v1/chat/completions
https://ai.example.com/v1/audio/speech
```

请求鉴权可以使用：

- 用户登录态对应的 Bearer token。
- 或 Sub2API 生成的 API Key。

项目侧不要在请求后本地扣余额。余额扣减、用量归集、模型价格、倍率、订阅额度、免费额度、失败回滚都由 Sub2API 处理。

## 10. 推荐适配层结构

每个业务项目建议只新增一层很薄的网关 client。

```text
src/
  utils/
    sub2api.ts
    auth.ts
    billing.ts
    payment.ts
```

职责：

- `sub2api.ts`：base URL、token、query、JSON、envelope 解包、错误处理。
- `auth.ts`：登录、注册、验证码、token 保存和刷新。
- `billing.ts`：用户资料、余额、返利、套餐、订阅进度。
- `payment.ts`：checkout info、创建订单、查询订单、取消订单。

不要把 Sub2API 字段散落在页面组件里。页面组件尽量只面对项目内稳定的 view model。

## 11. 旧项目迁移清单

AI 或工程师接入时按顺序执行：

1. 搜索旧账户/支付/计费代码：

```bash
rg "billing|payment|invite|referral|credits|points|membership|checkout|order" src api server
```

2. 找出旧数据源：

- 本地 API route。
- Supabase/Firebase/自建 DB。
- 本地 env catalog。
- 本地 invite code 生成函数。
- 本地 payment provider adapter。

3. 新增 Sub2API client，并接入统一 token。
4. 登录、注册、验证码改为 `/auth/*`。
5. 注册邀请字段统一映射为 `aff_code`。
6. 账户页余额改读 `/user/profile.balance`。
7. 邀请页改读 `/user/aff`，移除本地邀请码 fallback。
8. 邀请链接改成 `/register?aff=<aff_code>`。
9. 套餐列表改读 `/payment/checkout-info.plans`。
10. 余额充值订单改为 `order_type: "balance"`。
11. 套餐购买订单改为 `order_type: "subscription"` 并传 `plan_id`。
12. 订单状态改读 `/payment/orders/:id`，必要时用 `/payment/orders/verify`。
13. AI 请求改走 Sub2API OpenAI-compatible 网关。
14. 删除或退休旧 payment/billing/invite API 入口。
15. 把 UI 文案里的“积分”统一改为“余额”，除非产品明确保留积分作为非支付资产。

## 12. AI 执行边界

当 AI 在项目中执行该接入任务时，必须遵守：

- 先扫描现有结构，再给出真实诉求和解决方案拆分。
- 不改 UI 设计，除非用户明确要求。
- 优先保留旧页面组件，通过 adapter 改数据来源。
- 不引入新的支付 SDK，除非 Sub2API 返回字段要求前端 SDK。
- 不新增本地商业数据库表。
- 不新增本地支付 webhook。
- 不新增本地邀请码生成逻辑。
- 不硬编码套餐价格和套餐 ID；套餐来自 `/payment/checkout-info`。
- 不硬编码返利比例；返利比例来自 `/user/aff`。
- 不在前端保存支付密钥、admin token 或商户私钥。
- 修改后必须跑构建或对应测试，并报告未通过项。

AI 完成后至少要检查：

```bash
rg "api/billing|api/payment/create-order|membership_topup|topupCredits|creditsPer|generateInvite|referralCode" src
rg "积分|Credit balance|Buy credits|credits cover" src
```

如果仍有命中，需要判断是：

- 旧文档残留。
- 测试残留。
- UI 文案残留。
- 真实运行代码残留。

真实运行代码残留必须处理。

## 13. 验收清单

基础验收：

- 用户可以登录。
- 用户可以注册。
- 注册链接里的 `aff` 能进入注册请求的 `aff_code`。
- 账户页能显示 `balance`。
- 邀请页能显示网关返回的 `aff_code`。
- 本地不再生成邀请码。
- 套餐卡片来自 `/payment/checkout-info.plans`。
- 余额充值创建订单请求包含 `order_type: "balance"`。
- 套餐购买创建订单请求包含 `order_type: "subscription"` 和 `plan_id`。
- 支付后订单进入 `COMPLETED`。
- 支付后余额或订阅状态刷新。
- AI 请求能通过网关扣费并在 Sub2API 后台看到用量。

异常验收：

- token 过期时能刷新或要求重新登录。
- 支付方式不可用时前端不展示或禁用。
- 金额低于 `single_min` 或高于 `single_max` 时前端拦截。
- 订单超时后进入 `EXPIRED`。
- 用户取消订单后进入 `CANCELLED`。
- 回调延迟时 `/payment/orders/verify` 能补查状态。

## 14. 典型字段映射

| 项目旧字段 | Sub2API 字段 | 说明 |
| --- | --- | --- |
| `credits` | `balance` | 余额，不再称积分 |
| `bonusCredits` | `balance` 或 `aff_quota` | 视 UI 语义区分账户余额和可转返利 |
| `inviteCode` | `aff_code` | 真实邀请码来自网关 |
| `inviteCount` | `aff_count` | 邀请人数 |
| `rebateRate` | `effective_rebate_rate_percent` | 有效返利比例 |
| `historicalRebate` | `aff_history_quota` | 历史返利额度 |
| `frozenRebate` | `aff_frozen_quota` | 冻结返利额度 |
| `topup` | `balance` | 充值订单类型 |
| `planCode` | `plan_id` | 真实套餐购买依据 |
| `price` | `plans[].price` | 套餐价格来自网关 |
| `dailyQuota` | `daily_limit_usd` | 可转成 UI 显示额度 |

## 15. 回滚策略

推荐保留短期回滚开关，但只用于应急：

- 旧接口默认返回 `410 Gone` 或不再被前端调用。
- 回滚开关只能切回旧 route，不应继续扩展旧商业系统。
- 确认生产稳定后删除旧支付密钥、旧 webhook、旧 catalog env。

回滚前必须确认：

- 是否会造成双写余额。
- 是否会重复发放订阅。
- 是否有未完成订单仍在旧系统。
- 支付平台 webhook 是否只指向一个系统。

## 16. 最小可用接入示例

```ts
async function requestSub2Api(path: string, options: RequestInit = {}) {
  const base = import.meta.env.VITE_SUB2API_API_BASE || 'https://ai.example.com/api/v1'
  const token = localStorage.getItem('auth_token')
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.message || `HTTP ${response.status}`)
  }
  if (payload && typeof payload === 'object' && 'code' in payload) {
    if (payload.code !== 0) {
      throw new Error(payload.message || `Sub2API error ${payload.code}`)
    }
    return payload.data
  }
  return payload
}

async function createBalanceOrder(amount: number, paymentType: string) {
  return requestSub2Api('/payment/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount,
      payment_type: paymentType,
      order_type: 'balance',
      payment_source: 'your-product',
      return_url: window.location.href,
      is_mobile: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),
    }),
  })
}
```

## 17. 维护原则

以后 Sub2API 网关升级时，业务项目只跟随公共 API 合同升级：

- 新套餐字段只影响展示 adapter。
- 新支付方式只影响支付按钮映射。
- 新订单状态只影响轮询终态判断。
- 新返利规则不应要求业务项目改计算逻辑。
- 新 AI 计费规则不应要求业务项目改扣费逻辑。

如果某个需求需要业务项目新增商业事实，优先判断是否应该回到 Sub2API 网关实现。
