# FlowGuideAI Central Integration

FlowGuideAI (`https://ai.flowguide.cc`) is the central account, billing, payment, API key, and AI usage gateway for this product.

## Runtime Boundary

- Product pages and desktop windows stay in this project.
- Real user identity is issued by FlowGuideAI auth.
- Billing profile, balance, plans, recharge, payment orders, invite code, and usage are read from FlowGuideAI APIs.
- AI requests use the FlowGuideAI OpenAI-compatible gateway by default.
- Local auth, billing, payment, and invite server code is compatibility code only. Do not extend it as an independent commercial system.

## Default Endpoints

- Auth base: `https://ai.flowguide.cc`
- Login: `/api/auth/login`
- Register: `/api/auth/register`
- Send code: `/api/auth/send-code?scene=register|reset`
- Reset password: `/api/auth/reset-password`
- Billing profile: `/api/billing/profile`
- Billing catalog: `/api/billing/catalog`
- Payment config: `/api/payment/config`
- Create payment order: `/api/payment/create-order`
- AI chat gateway: `/v1/chat/completions`
- AI speech gateway: `/v1/audio/speech`

## Optional Environment Overrides

Use these only when FlowGuideAI changes domains or paths.

```env
VITE_FLOWGUIDE_API_BASE=https://ai.flowguide.cc
VITE_FLOWGUIDE_AI_GATEWAY_BASE=https://ai.flowguide.cc
VITE_FLOWGUIDE_CHAT_COMPLETIONS_URL=https://ai.flowguide.cc/v1/chat/completions
VITE_FLOWGUIDE_AUDIO_SPEECH_URL=https://ai.flowguide.cc/v1/audio/speech
VITE_FLOWGUIDE_AUTH_LOGIN_PATH=/api/auth/login
VITE_FLOWGUIDE_AUTH_REGISTER_PATH=/api/auth/register
VITE_FLOWGUIDE_AUTH_SEND_CODE_PATH=/api/auth/send-code
VITE_FLOWGUIDE_AUTH_RESET_PASSWORD_PATH=/api/auth/reset-password
```

## Vercel Environment Migration

The old Vercel deployment may still contain many variables for the self-orchestrated auth, payment, billing, invite, email, and Supabase backend. After centralizing on FlowGuideAI, treat them as follows.

### Keep On This Product Vercel

Only keep variables needed by this product shell.

```env
VITE_FLOWGUIDE_API_BASE=https://ai.flowguide.cc
VITE_FLOWGUIDE_AI_GATEWAY_BASE=https://ai.flowguide.cc
VITE_APP_BASE_URL=https://your-product.example.com
```

If FlowGuideAI endpoint paths are unchanged, the path override variables above are not required.

### Move To FlowGuideAI Vercel

Payment and commercial-system secrets belong to the FlowGuideAI/Sub2API deployment, not this product deployment.

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

### Remove Or Leave Unset Here

These should be removed from this product's Vercel project once production traffic is confirmed on FlowGuideAI.

- Old payment notify URLs pointing to this product, such as `ALIPAY_NOTIFY_URL`, `WXPAY_NOTIFY_URL`, `EASYPAY_NOTIFY_URL`, and `STRIPE_WEBHOOK_SECRET`.
- Old direct payment channel keys, such as `STRIPE_SECRET_KEY`, `ALIPAY_PRIVATE_KEY`, and `WXPAY_PRIVATE_KEY`.
- Old local billing catalog variables, such as `BILLING_TOPUP_PRESET_AMOUNTS` and `BILLING_PLAN_PRICE_*`.
- Old auth database and email variables, such as `SUPABASE_*`, `RESEND_*`, and `OTP_SECRET`.

### Compatibility Window

During migration, the old serverless routes can stay deployed but should not receive new production traffic. Keep them only for rollback until these checks pass:

- Existing users can sign in through the product UI and receive a FlowGuideAI session.
- `/api/billing/profile`, `/api/billing/catalog`, and `/api/payment/create-order` calls from the product resolve against FlowGuideAI.
- Payment provider webhooks are configured on FlowGuideAI callback URLs.
- AI requests are visible in FlowGuideAI usage statistics.
- Old product Vercel function logs show no new payment, billing, register, or consume traffic.

## Legacy Route Retirement

The old product routes are intentionally kept in the repository but retired at runtime.

- `api/auth.js`
- `api/billing.js`
- `api/payment.js`
- `api/admin.js`

Default behavior:

- Return `410 Gone`
- Return a JSON payload that marks the route as retired
- Include the FlowGuideAI base URL in the response

Rollback switch:

```env
FLOWGUIDE_LEGACY_ROUTE_MODE=passthrough
```

You can also scope the rollback to one route family:

```env
FLOWGUIDE_LEGACY_AUTH_MODE=passthrough
FLOWGUIDE_LEGACY_BILLING_MODE=passthrough
FLOWGUIDE_LEGACY_PAYMENT_MODE=passthrough
FLOWGUIDE_LEGACY_ADMIN_MODE=passthrough
```

These switches are for emergency rollback only. The normal production mode should leave them unset so legacy routes stay retired.

## Implementation Notes

- `src/utils/auth.js` keeps the original login/register UI contract but calls FlowGuideAI.
- `src/utils/backendApi.js` sends billing and payment API calls to FlowGuideAI by default.
- `src/utils/aiConfig.js` defaults AI and OpenAI TTS URLs to FlowGuideAI gateway URLs.
- Existing saved OpenAI, Claude, and Gemini official gateway URLs are migrated to FlowGuideAI and their old vendor API keys are cleared.
- If a FlowGuideAI API key is not configured locally, logged-in users can call the FlowGuideAI gateway with their FlowGuideAI session token.
- `server/lib/legacyRoute.js` is the retirement guard for old product-side auth, billing, payment, and admin APIs.
