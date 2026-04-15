# 官方支付联调清单

本文对应当前本地支付链路，适用于 `alipay` 和 `wxpay` 官方直连适配器。

## 1. 基础环境

- 确认 `APP_BASE_URL` 指向真实可访问的公网域名。
- 确认前端域名已加入 `PAYMENT_ALLOWED_ORIGINS` 或 `CORS_ALLOWED_ORIGINS`。
- 确认数据库可写，`payment_orders`、`payment_attempts`、`payment_webhook_events`、`billing_profiles` 等表可自动创建。
- 确认登录态正常，前端请求会自动携带 `Authorization: Bearer <token>`。

## 2. 支付宝官方联调

- 配置 `ALIPAY_APP_ID`。
- 配置 `ALIPAY_PRIVATE_KEY`。
- 配置 `ALIPAY_PUBLIC_KEY`。
- 配置 `ALIPAY_NOTIFY_URL={{APP_BASE_URL}}/api/payment/webhook`。
- 配置 `ALIPAY_RETURN_URL` 为你的支付完成页。
- 在支付宝开放平台中确认应用已开通网页支付能力；如果桌面端要走程序内二维码，还需开通支持 `alipay.trade.precreate` 的扫码/当面付能力。
- 确认回调地址与应用公钥、支付宝公钥一致，没有混用沙箱和正式环境。

## 3. 微信支付官方联调

- 配置 `WXPAY_APP_ID`。
- 配置 `WXPAY_MCH_ID`。
- 配置 `WXPAY_PRIVATE_KEY`。
- 配置 `WXPAY_CERT_SERIAL`。
- 配置 `WXPAY_API_V3_KEY`。
- 配置 `WXPAY_PUBLIC_KEY`。
- 配置 `WXPAY_PUBLIC_KEY_ID`。
- 配置 `WXPAY_NOTIFY_URL={{APP_BASE_URL}}/api/payment/webhook`。
- 当前后端会根据支付宝回调体字段或微信支付签名头自动识别渠道，一般不需要在 webhook URL 上额外带 `provider` 参数。
- 确认商户平台 APIv3 密钥、平台证书、公钥模式与当前配置一致。
- 桌面端默认优先走二维码/NATIVE，移动端会按上下文切到 H5。

## 4. 套餐与价格

- 配置 `BILLING_TOPUP_PRESET_AMOUNTS`，控制充值快捷金额。
- 配置 `BILLING_TOPUP_CREDITS_PER_CNY`，控制 1 元对应多少积分。
- 配置以下会员价格：
- `BILLING_PLAN_PRICE_MEMBERSHIP_BASIC_MONTH`
- `BILLING_PLAN_PRICE_MEMBERSHIP_BASIC_YEAR`
- `BILLING_PLAN_PRICE_MEMBERSHIP_PRO_MONTH`
- `BILLING_PLAN_PRICE_MEMBERSHIP_PRO_YEAR`
- `BILLING_PLAN_PRICE_MEMBERSHIP_ENTERPRISE_MONTH`
- `BILLING_PLAN_PRICE_MEMBERSHIP_ENTERPRISE_YEAR`

## 5. 联调步骤

1. 登录一个普通用户账号，打开账户页。
2. 调用 `GET /api/payment/config`，确认目标支付渠道 `ready=true`。
3. 调用 `GET /api/billing/catalog`，确认套餐与价格返回正常。
4. 创建一笔充值订单，确认订单能拉起支付页或二维码。
5. 完成支付后确认 webhook 已命中 `/api/payment/webhook`。
6. 调用 `GET|POST /api/payment/order-status`，确认订单进入 `COMPLETED`。
7. 调用 `GET|POST /api/billing/profile`，确认积分或会员权益已发放。
8. 在账户页确认“会员状态 / 到期时间 / 积分余额”已经自动刷新。
9. 用同一个 `idempotencyKey` 重放创建请求，确认不会重复建单。
10. 重放同一笔 webhook，确认不会重复发放权益。

## 6. 管理员接口

- `POST /api/admin/billing?action=refund`
- 请求体：`{ "orderId": "...", "reason": "..." }`
- 要求：携带 `X-Admin-Token`
- 行为：对已支付订单发起退款；如果渠道已经确认退款，会同步把订单推进到 `REFUNDED` 并回滚已发放权益。

- `POST /api/admin/billing?action=membership`
- 请求体：`{ "userId": "...", "action": "suspend|resume", "reason": "..." }`
- 要求：携带 `X-Admin-Token`
- 行为：暂停或恢复会员状态。

## 7. 当前支持范围

### 已支持

- 支付成功后自动发放积分或会员。
- 账户页自动轮询订单状态。
- 支付成功后自动刷新会员/计费信息。
- 会员续费顺延。
- 管理员退款接口。
- 管理员暂停 / 恢复会员接口。

### 现阶段未完成

- 还没有图形化的管理员后台页面。
- 会员“中止 / 彻底取消”接口还没单独补。
- 对历史老订单，如果当时没有记录足够的订阅快照，订阅退款可能需要人工处理。
- 当某个订阅订单之后又有新的订阅续费时，旧订阅订单退款会被安全拦截，避免把会员状态回滚乱掉。

## 8. 现在的续费规则

- 如果用户当前会员仍有效，再买同档或其他档位会员，新的时长会从现有 `subscription_expires_at` 往后累加。
- 这套逻辑已经在计费引擎里生效，不依赖前端。
