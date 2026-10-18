# Lilith Desktop Pet（莉莉丝桌宠）

[English](README.md)

一个基于 Electron 的桌面宠物（macOS，Windows 为实验性支持）：莉莉丝漂浮在桌面上，会自己走动、发呆、聊天。可以通过本机 Qoder CLI，或任意 OpenAI 兼容 / Anthropic 接口对话；支持流式回复、思考过程和工具调用。

## 目录结构

```
Lilith-Desktop-Pet/
├── LilithPet/            # Electron 应用源码（需要 npm install）
├── Lilith 桌宠.app       # macOS 双击启动器（需与 LilithPet 放在同一目录）
├── Lilith 桌宠.cmd       # Windows 双击启动器（需与 LilithPet 同目录）
├── Lilith/               # 原版 3D 模型源文件（FBX + 贴图）
├── Lilith_mao/           # 魔王（Maou）模型源文件（FBX + 贴图；目录沿用原文件名）
└── Deepseek_M/           # DeepSeek M 模型源文件（FBX + 贴图）
```

## 运行

### 1. 安装 Node.js

需要 Node.js 18 或更高版本——从 [nodejs.org](https://nodejs.org/) 下载安装，或用包管理器：

```bash
brew install node                  # macOS（Homebrew）
winget install OpenJS.NodeJS.LTS   # Windows（winget）
```

安装完成后可以检查：

```bash
node -v    # 应显示 v18.x 或更高
```

### 2. 克隆本仓库

```bash
git clone https://github.com/ScFractures/lilith-desktop-pet.git
cd lilith-desktop-pet
```

没有安装 Git？在仓库页面点 **Code → Download ZIP** 下载压缩包解压即可。

### 3. 安装依赖

```bash
cd LilithPet
npm install
```

注意必须在 `LilithPet/` 子目录里执行——仓库根目录没有 `package.json`。

### 4. 启动

macOS：

```bash
npm start
```

或直接双击 `Lilith 桌宠.app`（.app 会自动找到同目录下的 LilithPet）。

Windows（实验性）：

```bash
npm start
```

或直接双击 `Lilith 桌宠.cmd`。

首次打开 `Lilith 桌宠.app` 如果被 macOS 拦截（"无法验证开发者"），在"系统设置 → 隐私与安全性"里点"仍要打开"，或右键图标选择"打开"。

## 使用

- 拖拽桌宠可以移动位置，它会随机四处走动。
- 右键桌宠打开菜单：**Qoder 对话…**、Qoder 余额、大小、3D 模型、摸摸头/走一走/转圈/跳一下/打招呼/睡觉、语言、隐藏和退出。
- **Qoder 对话…** 会打开独立的对话窗口。在顶部选择模型、权限模式和工作目录，回车发送。回复实时流式显示，模型的思考内容放在可折叠的「思考过程」里，**停止**可以随时中断。**新对话**旁边的圆点表示 Qoder 会话是否已连接。
- 工具调用会收进一行默认折叠的「工具调用」总览，不会挡住思考过程。展开总览可以看到每次调用，再点开单次调用查看输入和结果；运行中会显示当前工具，失败时会显示失败数量。
- **Qoder 模型**会在选定的工作目录里运行本机 Qoder CLI，因此可以读文件、跑命令、改代码。权限模式决定允许哪些操作：**YOLO** 不确认直接执行工具，使用前请确认工作目录正确。没有安装 Qoder CLI 时，仍然可以使用自定义模型。
- **添加模型**会打开模型设置页。自定义模型支持任意 OpenAI 兼容接口（Chat Completions 或 Responses API）和 Anthropic Messages API。可以自动读取模型列表和每个模型支持的思考深度，也可以手动填写模型 ID；测试连接后保存。添加的模型会出现在对话窗口的模型菜单里，并直接请求对应接口——不启用 Qoder 工具、权限模式和工作目录。
- **新对话**会清空窗口里的当前对话，并开始新的会话。
- 界面和台词都做了中英双语：右键菜单（或托盘菜单）里的「语言」随时切换，默认跟随系统语言。桌宠、对话窗口和模型设置页都会立即更新。
- 右键菜单里的 **Qoder 余额** 会让莉莉丝读取本机 Qoder CLI 的额度（需要登录 Qoder），并播报剩余 credits。

### 数据保存在哪里

设置、对话记录和 API Key 都只保存在你自己的电脑上，位于系统应用数据目录（macOS 为 `~/Library/Application Support/Lilith Pet/`）：

- `pet-state.json` —— 桌宠位置、大小、当前 3D 模型、语言和窗口位置
- `custom-models.json` —— 自定义接口及其 API Key（以明文保存在本机，不会上传）
- `qoder-chat.json` —— 对话记录
- `qoder-models.json` —— Qoder 模型列表缓存
- `qoder-balance.json` —— Qoder 额度缓存

消息只会发送到你选择的提供方：Qoder 模型走本机 Qoder CLI，自定义模型只发送到它自己的 Base URL。

## 模型

应用内置三个 3D 模型：原版莉莉丝（`LilithPet/assets/lilith.glb`）、魔王版莉莉丝（`LilithPet/assets/lilith_maou.glb`，源文件在 `Lilith_mao/`）和 DeepSeek M（`LilithPet/assets/deepseek_m.glb`，源文件在 `Deepseek_M/`）。在右键菜单或托盘菜单的「模型」里切换，选择会保存在本地，下次启动自动恢复。

每个模型都有独立的本地台词和人格：莉莉丝（原版/魔王）温柔、诗意、带点调皮；DeepSeek M 则冷静、简洁、偏理性，带一点克制的冷幽默。切换模型会同时切换她的本地台词和人格。Qoder 对话窗口使用的模型在该窗口里单独选择，不受这里影响。

如需用 Blender 4.x 或更高版本从 FBX 源文件重新生成 GLB：

```bash
Blender -b --python LilithPet/scripts/import_fbx_glb.py -- \
  Lilith_mao/Lilith_mao.fbx LilithPet/assets/lilith_maou.glb \
  --texture Lilith_mao/Lilith_mao/Lilith_mao_basecolor.JPEG

Blender -b --python LilithPet/scripts/import_fbx_glb.py -- \
  Deepseek_M/Deepseek_M.fbx LilithPet/assets/deepseek_m.glb \
  --texture Deepseek_M/Deepseek_M/Deepseek_M_basecolor.JPEG
```

脚本会合并网格、减面到约 26 万三角面、把 8K 贴图缩到 4K 并导出 Y-up 的 GLB，不会修改源文件。

## 常见问题

- `npm error code ENOENT ... Could not read package.json`：npm 跑在了错误的目录。先 `cd LilithPet`——仓库根目录没有 `package.json`。
- npm 卡住，或报 `ETIMEDOUT` / `ECONNRESET`（常见于 `electron` 下载步骤）：部分网络直连 npm 官方源和 Electron 二进制很慢或不通。换国内镜像：

  ```bash
  npm config set registry https://registry.npmmirror.com
  npm config set electron_mirror https://npmmirror.com/mirrors/electron/
  ```

  然后删掉 `node_modules`，重新 `npm install`。
- 报 `Error: Electron failed to install correctly`：与上一条同因——配好镜像，删 `node_modules` 重装。
- Windows 报 `'npm' 不是内部或外部命令`：Node.js 没装，或装完没重开终端。安装 Node.js 18+ 后新开终端，用 `node -v` 确认。
- **找不到 Qoder CLI / Qoder 运行失败**：安装并登录 Qoder CLI，确认可执行文件位于 `~/.qoder-cn/entry/qoder-cn`，或者用 `QODERCN_CLI` 环境变量指定路径。没有 Qoder CLI 时仍可使用自定义模型。
- **自定义模型连接失败**：检查模型设置页里的 Base URL、API Key 和模型 ID，并点「测试连接」。部分服务需要 `/v1` 后缀；Anthropic 使用 `x-api-key` 鉴权。
- Windows 启动即崩溃（报错含 GPU 字样）：启动器已自动禁用 DirectComposition 规避透明窗口崩溃；若仍崩溃，在启动命令末尾追加 `--no-sandbox`（编辑 `Lilith 桌宠.cmd` 最后一行，或执行 `npm start -- --no-sandbox`）。

## 说明

- Windows 支持为实验性质，但已在真实 Windows 11 机器上验证可用：透明点击穿透窗口在部分显卡驱动组合下需要禁用 DirectComposition 的兼容开关，程序在 Windows 上会自动加上。
- Windows 上其他应用全屏（游戏、视频）时，桌宠会自动隐藏，退出全屏后恢复——与 macOS 行为一致。
- 模型文件版权归原作者所有，请勿商用。
