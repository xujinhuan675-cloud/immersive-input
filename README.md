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

-   [使用说明](#使用说明)
-   [特色功能](#特色功能)
-   [支持接口](#支持接口)
-   [插件系统](#插件系统)
-   [安装指南](#安装指南)
-   [外部调用](#外部调用)
-   [Wayland 支持](#wayland-支持)
-   [手动编译](#手动编译)
-   [感谢](#感谢)

# 使用说明

## 认证与登录

首次使用 Immersive Input 需要注册账号并登录：

1. **启动应用**：程序会自动打开设置窗口
2. **注册账号**：点击"注册新账号"，填写用户名、邮箱和密码（需包含数字、大小写字母，至少8位）
3. **验证邮箱**：输入邮箱收到的验证码
4. **记住密码**：勾选"记住账号"可保存登录信息（仅保存在本地设备）
5. **开始使用**：登录成功后即可使用所有功能

> 💡 密码保存在本地设备，不会上传到云端。如忘记密码，可点击"忘记密码"通过邮箱重置。

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
- **自动显示**：选中文本后自动显示（需在设置中启用）

**功能说明：**

选中文本后自动显示浮动工具栏，提供快速访问入口。

- 可配置显示的功能按钮（翻译、轻AI、解释、对话等）
- 提供快捷操作入口，无需记忆快捷键
- 工具栏位置自动跟随鼠标，智能避免遮挡

**配置选项：**
- 在「偏好设置 → 翻译设置」中配置是否启用浮动工具栏
- 可选择划词后直接翻译或先显示工具栏

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

# 感谢

</div>

-   [Pot](https://github.com/pot-app/pot-desktop) 项目基础
-   [Bob](https://github.com/ripperhe/Bob) 灵感来源
-   [Tauri](https://github.com/tauri-apps/tauri) 优秀的 GUI 框架

<div align="center">

