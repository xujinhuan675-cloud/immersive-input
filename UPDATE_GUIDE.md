# Tauri 自动更新配置指南

## 完整发布流程

### 1. 准备阶段（首次配置）

#### 1.1 生成密钥对

```bash
# 生成密钥对（只需执行一次）
pnpm tauri signer generate -w ~/.tauri/immersive-input.key

# 会输出公钥，类似：
# dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFla...
```

#### 1.2 配置 tauri.conf.json

将生成的公钥填入 `src-tauri/tauri.conf.json`：

```json
"updater": {
    "active": true,
    "dialog": false,
    "endpoints": [
        "https://github.com/IOTO-Doc/Immersive-Input/releases/latest/download/latest.json"
    ],
    "pubkey": "这里粘贴刚才生成的公钥"
}
```

#### 1.3 修改脚本中的仓库地址

编辑 `scripts/generate-update-manifest.mjs`，修改第 23 行：

```javascript
const GITHUB_REPO = '你的用户名/Immersive-Input';  // 改为你的实际仓库
```

### 2. 发布新版本

#### 2.1 更新版本号

修改 `src-tauri/tauri.conf.json` 中的版本号：

```json
"package": {
    "productName": "Immersive Input",
    "version": "3.0.8"  // 从 3.0.7 改为 3.0.8
}
```

#### 2.2 构建应用（带签名）

```bash
# 设置私钥环境变量
export TAURI_PRIVATE_KEY=$(cat ~/.tauri/immersive-input.key)
export TAURI_KEY_PASSWORD=""  # 如果设置了密码就填入

# Windows PowerShell 用户使用：
# $env:TAURI_PRIVATE_KEY = Get-Content ~/.tauri/immersive-input.key -Raw
# $env:TAURI_KEY_PASSWORD = ""

# 构建
pnpm tauri build
```

构建完成后会在 `src-tauri/target/release/bundle/` 生成：
- 安装包（`.msi`、`.exe`、`.dmg`、`.AppImage` 等）
- 签名文件（`.sig`）

#### 2.3 生成更新清单

```bash
pnpm run generate-update
```

会在项目根目录生成 `latest.json` 文件。

#### 2.4 发布到 GitHub Releases

1. 在 GitHub 仓库创建新的 Release
   - Tag: `v3.0.8`
   - Title: `v3.0.8`
   - Description: 填写更新日志

2. 上传文件到 Release：
   - `latest.json`（必须）
   - 所有平台的安装包
   - 所有平台的 `.sig` 签名文件

3. 发布 Release

### 3. 用户更新流程

用户启动应用时：
1. 自动检查更新（对比本地版本 vs GitHub 最新版本）
2. 如果有新版本，弹出更新窗口
3. 用户点击"更新"按钮
4. 自动下载安装包（显示进度）
5. 自动安装并重启应用
6. 用户数据完全保留

## 常见问题

### Q: 没有云端程序会怎样？
A: 应用会检查更新，但找不到新版本，显示"已是最新版本"，不会报错。

### Q: 必须配置签名吗？
A: 生产环境强烈建议配置，确保更新包安全。开发测试阶段可以暂时不配置（pubkey 留空）。

### Q: 支持哪些平台？
A: Windows (x64)、macOS (Intel/Apple Silicon)、Linux (x64)

### Q: 更新后用户数据会丢失吗？
A: 不会。配置文件、登录状态、localStorage 都会保留。

### Q: 可以回滚到旧版本吗？
A: 不支持自动回滚。用户需要手动下载旧版本安装。

### Q: 如何禁用自动更新？
A: 在 `tauri.conf.json` 中设置 `"active": false`

## 文件说明

- `tauri.conf.json` - Tauri 配置文件，包含版本号和更新配置
- `scripts/generate-update-manifest.mjs` - 自动生成 latest.json 的脚本
- `latest.json` - 更新清单文件（上传到 GitHub Releases）
- `~/.tauri/immersive-input.key` - 私钥文件（保密，不要提交到 Git）

## 安全提示

⚠️ **私钥文件绝对不能泄露或提交到 Git 仓库！**

建议在 `.gitignore` 中添加：
```
*.key
latest.json
```
