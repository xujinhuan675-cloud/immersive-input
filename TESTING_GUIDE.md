# 注册登录功能测试指南

## 📋 前置准备

### 1. 环境配置检查

确认 `.env` 文件包含以下配置：

```bash
# Supabase
VITE_SUPABASE_URL=https://hacrkscarbbbmzmmeqse.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 邮件服务（Resend）
RESEND_API_KEY=re_Zh95C6oA_VVXExHb5VE6hpmS4WTpyJHRr
RESEND_FROM=noreply@openeducation.top

# OTP 密钥
OTP_SECRET=HNhkwU2NpdfxxzJnH7lMcVnv9oxVQ1XL

# 数据库初始化令牌
INIT_DB_TOKEN=JnY64uwftlQThTxzlChHWonJIjNFsROH
```

### 2. 数据库初始化

**方法 A：通过 Supabase Dashboard（推荐）**

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目：`hacrkscarbbbmzmmeqse`
3. 进入 SQL Editor
4. 复制并执行 `supabase/migrations/001_create_email_otps.sql` 中的 SQL
5. 点击 Run 执行

**方法 B：通过 API 接口**

```bash
# 本地开发环境
curl -X POST http://localhost:3000/api/admin/init-db \
  -H "Content-Type: application/json" \
  -d '{"token": "JnY64uwftlQThTxzlChHWonJIjNFsROH"}'

# 生产环境（部署到 Vercel 后）
curl -X POST https://your-app.vercel.app/api/admin/init-db \
  -H "Content-Type: application/json" \
  -d '{"token": "JnY64uwftlQThTxzlChHWonJIjNFsROH"}'
```

### 3. 验证数据库表

在 Supabase Dashboard → Table Editor 中检查：
- ✅ `email_otps` 表已创建
- ✅ 表结构包含：email, code_hash, expires_at, cooldown_until, send_count, last_sent_at

---

## 🧪 测试流程

### 测试 1：注册新用户

#### 步骤：

1. **启动开发服务器**
   ```bash
   cd Immersive-Input
   pnpm dev
   ```

2. **打开登录窗口**
   - 在应用中触发登录窗口
   - 或直接访问：`http://localhost:1420` (Tauri 开发端口)

3. **切换到注册标签**
   - 点击"注册新账号"

4. **填写注册信息**
   - 用户名：`testuser`
   - 邮箱前缀：`test`
   - 邮箱域名：选择 `gmail.com`
   - 密码：`Test1234`（至少 8 位，包含大小写字母和数字）
   - 确认密码：`Test1234`

5. **发送验证码**
   - 点击"发送验证码"按钮
   - 等待 1-2 秒
   - 应该看到成功提示："验证码已发送，请查收邮件"
   - 按钮变为倒计时状态（60 秒）

6. **检查邮箱**
   - 打开 `test@gmail.com` 邮箱
   - 查找来自 `noreply@openeducation.top` 的邮件
   - 主题：`Your verification code`
   - 内容：`Your verification code is: XXXXXX. It expires in 10 minutes.`

7. **输入验证码并注册**
   - 在验证码输入框填入收到的 6 位数字
   - 点击"注册并登录"
   - 等待 1-2 秒
   - 应该看到成功提示："注册成功，欢迎加入！"
   - 登录窗口自动关闭

#### 预期结果：

✅ 验证码邮件成功发送
✅ 用户在 Supabase Auth 中创建成功
✅ 自动登录成功
✅ localStorage 中保存了 token 和 user 信息

#### 验证数据：

**在 Supabase Dashboard 中检查：**

1. **Authentication → Users**
   - 应该看到新用户：`test@gmail.com`
   - Email Confirmed: ✅
   - User Metadata 包含：`display_name: "testuser"`

2. **Table Editor → email_otps**
   - 应该看到一条记录（或已被清除）
   - email: `test@gmail.com`
   - send_count: 1

**在浏览器 DevTools 中检查：**

```javascript
// 打开 Console
localStorage.getItem('auth_token')  // 应该有 JWT token
localStorage.getItem('auth_user')   // 应该有用户信息 JSON
```

---

### 测试 2：登录已有用户

#### 步骤：

1. **清除本地存储（模拟退出）**
   ```javascript
   localStorage.removeItem('auth_token')
   localStorage.removeItem('auth_user')
   ```

2. **打开登录窗口**
   - 切换到"登录账号"标签

3. **填写登录信息**
   - 用户名/邮箱：`test@gmail.com`
   - 密码：`Test1234`
   - 勾选"记住账号"

4. **点击登录**
   - 等待 1-2 秒
   - 应该看到成功提示："登录成功"
   - 窗口自动关闭

#### 预期结果：

✅ 登录成功
✅ localStorage 中保存了 token 和 user
✅ localStorage 中保存了 `auth_remember_email`

---

### 测试 3：验证码限流测试

#### 步骤：

1. **连续发送验证码**
   - 在注册页面，使用同一个邮箱
   - 连续点击"发送验证码" 3 次（间隔 < 60 秒）

#### 预期结果：

✅ 第 1 次：成功发送，倒计时 60 秒
✅ 第 2 次：按钮禁用（倒计时中）
✅ 第 3 次：按钮禁用（倒计时中）

---

### 测试 4：验证码过期测试

#### 步骤：

1. **发送验证码**
   - 使用新邮箱发送验证码

2. **等待 11 分钟**
   - 验证码有效期为 10 分钟

3. **尝试注册**
   - 输入过期的验证码
   - 点击注册

#### 预期结果：

❌ 注册失败
❌ 错误提示："Code expired"

---

### 测试 5：错误验证码测试

#### 步骤：

1. **发送验证码**
   - 使用新邮箱发送验证码

2. **输入错误验证码**
   - 输入：`000000`（假设不是真实验证码）
   - 点击注册

#### 预期结果：

❌ 注册失败
❌ 错误提示："Invalid code"

---

### 测试 6：重复注册测试

#### 步骤：

1. **使用已注册邮箱**
   - 邮箱：`test@gmail.com`（之前注册过的）
   - 发送验证码
   - 输入正确验证码
   - 点击注册

#### 预期结果：

❌ 注册失败
❌ 错误提示："User already registered" 或类似信息

---

## 🐛 常见问题排查

### 问题 1：验证码邮件未收到

**排查步骤：**

1. **检查垃圾邮件文件夹**
   - Gmail/Outlook 可能将验证码邮件标记为垃圾邮件

2. **检查 Resend Dashboard**
   - 登录 [Resend Dashboard](https://resend.com/emails)
   - 查看邮件发送日志
   - 确认邮件状态：Delivered / Bounced / Failed

3. **检查 Vercel Functions 日志**
   - 登录 [Vercel Dashboard](https://vercel.com)
   - 进入项目 → Functions
   - 查看 `/api/auth/send-register-code` 的日志

4. **检查环境变量**
   ```bash
   # 确认 Resend API Key 正确
   echo $RESEND_API_KEY
   
   # 确认发件人邮箱正确
   echo $RESEND_FROM
   ```

### 问题 2：数据库连接失败

**排查步骤：**

1. **检查 Supabase 连接**
   ```bash
   # 测试数据库连接
   psql "postgresql://postgres.hacrkscarbbbmzmmeqse:.WTJ8Nw-HbZ6htj@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
   ```

2. **检查 Supabase 项目状态**
   - 登录 Supabase Dashboard
   - 确认项目状态：Active
   - 确认数据库未暂停

3. **检查 RLS 策略**
   - 在 Supabase Dashboard → Authentication → Policies
   - 确认 `email_otps` 表的 RLS 策略正确

### 问题 3：CORS 错误

**排查步骤：**

1. **检查 Vercel 配置**
   - 确认 `vercel.json` 中配置了 CORS

2. **检查 API 响应头**
   ```bash
   curl -I https://your-app.vercel.app/api/auth/send-register-code
   # 应该包含：
   # Access-Control-Allow-Origin: *
   # Access-Control-Allow-Methods: GET, POST, OPTIONS
   ```

### 问题 4：Token 验证失败

**排查步骤：**

1. **检查 JWT Token**
   ```javascript
   // 在浏览器 Console 中
   const token = localStorage.getItem('auth_token')
   console.log(token)
   
   // 解码 JWT（使用 jwt.io）
   // 检查 exp（过期时间）是否有效
   ```

2. **检查 Supabase Auth 配置**
   - 在 Supabase Dashboard → Authentication → Settings
   - 确认 JWT expiry 设置合理（默认 3600 秒）

---

## 📊 测试检查清单

### 功能测试

- [ ] 注册新用户成功
- [ ] 验证码邮件发送成功
- [ ] 验证码验证成功
- [ ] 登录已有用户成功
- [ ] 记住账号功能正常
- [ ] 退出登录功能正常

### 安全测试

- [ ] 验证码限流生效（60 秒冷却）
- [ ] 验证码过期检测生效（10 分钟）
- [ ] 错误验证码被拒绝
- [ ] 重复注册被拒绝
- [ ] 密码强度验证生效（至少 8 位）

### 数据库测试

- [ ] `email_otps` 表创建成功
- [ ] 用户数据正确保存到 Supabase Auth
- [ ] User Metadata 正确保存（display_name）
- [ ] 验证码记录正确保存

### UI/UX 测试

- [ ] 登录/注册表单切换流畅
- [ ] 验证码倒计时显示正确
- [ ] 错误提示清晰易懂
- [ ] 成功提示及时显示
- [ ] 窗口自动关闭正常

---

## 🚀 部署后测试

### 1. 部署到 Vercel

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel --prod
```

### 2. 配置环境变量

在 Vercel Dashboard → Settings → Environment Variables 中添加：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `OTP_SECRET`
- `INIT_DB_TOKEN`

### 3. 初始化生产数据库

```bash
curl -X POST https://your-app.vercel.app/api/admin/init-db \
  -H "Content-Type: application/json" \
  -d '{"token": "JnY64uwftlQThTxzlChHWonJIjNFsROH"}'
```

### 4. 重复上述所有测试

使用生产环境 URL 重新测试所有功能。

---

## 📝 测试记录模板

```markdown
## 测试日期：2026-04-05

### 测试环境
- [ ] 本地开发环境
- [ ] Vercel 生产环境

### 测试结果
| 测试项 | 状态 | 备注 |
|--------|------|------|
| 注册新用户 | ✅ | 成功 |
| 验证码发送 | ✅ | 邮件 2 秒内到达 |
| 登录功能 | ✅ | 成功 |
| 验证码限流 | ✅ | 60 秒冷却生效 |
| 验证码过期 | ✅ | 10 分钟后失效 |

### 发现的问题
1. 无

### 待优化项
1. 验证码邮件模板可以更美观
2. 可以添加邮箱格式实时验证
```

---

## 🎯 下一步优化建议

1. **邮件模板美化**
   - 使用 HTML 邮件模板
   - 添加品牌 Logo
   - 优化移动端显示

2. **安全增强**
   - 添加图形验证码（防止机器人）
   - 添加 IP 限流
   - 添加设备指纹识别

3. **用户体验优化**
   - 添加密码强度指示器
   - 添加邮箱格式实时验证
   - 添加"重新发送验证码"按钮

4. **监控和日志**
   - 集成 Sentry 错误追踪
   - 添加用户行为分析
   - 添加邮件发送成功率监控

---

## 📚 相关文档

- [Supabase Auth 文档](https://supabase.com/docs/guides/auth)
- [Resend 文档](https://resend.com/docs)
- [Vercel Functions 文档](https://vercel.com/docs/functions)
- [Tauri 文档](https://tauri.app/v1/guides/)
