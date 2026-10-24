# Lilith Desktop Pet（莉莉丝桌宠）

[English](README.md)

一个基于 Electron 的桌面宠物（macOS，Windows 为实验性支持）：莉莉丝漂浮在桌面上，会自己走动、发呆、聊天。支持接入 OpenAI 兼容或 Anthropic 的 API（包括推理模型）进行 AI 对话。

## 目录结构

```
Lilith-Desktop-Pet/
├── LilithPet/            # Electron 应用源码（需要 npm install）
├── Lilith 桌宠.app       # macOS 双击启动器（需与 LilithPet 放在同一目录）
├── Lilith 桌宠.cmd       # Windows 双击启动器（需与 LilithPet 同目录）
├── Lilith/               # 原版 3D 模型源文件（FBX + 贴图）
├── Deepseek_M/           # DeepSeek M 模型源文件（FBX + 贴图）
└── Miku/                 # 初音未来贴图源文件（FBX 未包含）
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
- 右键桌宠打开菜单：大小、3D 模型、摸摸头/走一走/转圈/跳一下/打招呼/睡觉、**对话窗口**、**模型设置**、语言、隐藏和退出。托盘菜单里也有对话窗口和模型设置。
- **对话窗口** 会打开独立的聊天窗口。在顶部下拉框选择已保存的模型，回车发送，生成过程中可以随时中断；也可以直接继续输入「插嘴」，会先停止当前回答再发送新消息。回复会实时流式显示，模型返回的思考内容会完整显示在回复上方，单次运行最长可持续 12 小时。窗口会记住大小和位置。左上角可以打开**历史面板**：每个对话都独立保存自己的模型、模式、工作目录、消息和未发送的草稿，支持按消息内容搜索、切换、重命名和删除；标题会在第一次回答后自动生成，也可以点 ✦ 让模型重新起一个。所有对话都只保存在本机。
- **模型设置** 可以同时保存多个接口：**OpenAI 兼容**和 **Anthropic** 都可以开启推理（OpenAI 使用 `reasoning_effort` 或 Responses API，Anthropic 使用扩展思考）。填好 Base URL 和 API Key 后可以用「读取模型」自动拉取模型列表和每个模型支持的思考深度（Anthropic 读取 Models API 的 capabilities，OpenAI 根据模型 ID 推断），不受支持的档位会自动禁用；也可以手动填写模型 ID，然后点"测试连接"确认可用后保存。Base URL 示例：`https://api.deepseek.com/v1`、`https://api.anthropic.com` 或本地服务地址。
- 自定义模型默认只聊天。编辑模型并勾选 **允许工具调用** 后，对话窗口会为该模型启用终端和文件工具（`run_command`、`read_file`、`write_file`、`list_files`），工具调用会以可展开的分组显示在回复下方。工具只能访问对话窗口选定的**工作目录**；顶部**模式**控制权限：**只读**可以查看文件和目录，**读写**可以创建和修改文件但不能执行命令，**完全访问**可以执行终端命令。切换模式不会清空当前对话；更换工作目录会新开一个对话。
- 切换 3D 模型会切换她的本地台词和人格；对话窗口使用的模型在该窗口里单独选择。
- 界面和台词都做了中英双语：右键菜单（或托盘菜单）里的「语言」随时切换，默认跟随系统语言。桌宠、对话窗口和模型设置页都会立即更新。
- macOS 上默认开启 **避让打开的窗口**（可在右键或托盘菜单关闭）：她只在屏幕底边没有被其他应用窗口遮住的空档里走动，窗口盖到她时会自动挪到最近的空位，整条底边都被占满时暂时隐藏。

### 数据保存在哪里

设置、对话记录和 API Key 都只保存在你自己的电脑上，位于系统应用数据目录（macOS 为 `~/Library/Application Support/Lilith Pet/`）：

- `pet-state.json` —— 桌宠位置、大小、当前 3D 模型、语言和对话窗口位置
- `custom-models.json` —— 自定义接口及其 API Key（以明文保存在本机，不会上传）
- `custom-chat.json` —— 所有对话、标题和未发送的草稿

消息只会发送到你选择的自定义模型的 Base URL。如果使用过带 `ai-config.json` 的旧版本，其中的接口会在首次启动时导入 `custom-models.json`。

## 模型

应用内置三个模型：原版莉莉丝（`LilithPet/assets/lilith.glb`）、DeepSeek M（`LilithPet/assets/deepseek_m.glb`，源文件在 `Deepseek_M/`）和初音未来（`LilithPet/assets/miku.glb`，贴图源文件在 `Miku/`）。在右键菜单或托盘菜单的「模型」里切换，选择会保存在本地，下次启动自动恢复。

每个模型都有独立的人格和声音：莉莉丝温柔、诗意、带点调皮；DeepSeek M 冷静、简洁、偏理性，带一点克制的冷幽默；初音未来明亮、活泼、有音乐感，偶尔有点小得意。切换模型会同时切换 AI 系统提示词和所有本地台词；聊天记录仍保留在历史面板里。

如需用 Blender 4.x 或更高版本从源文件重新生成 GLB：

```bash
Blender -b --python LilithPet/scripts/import_fbx_glb.py -- \
  Deepseek_M/Deepseek_M.fbx LilithPet/assets/deepseek_m.glb \
  --texture Deepseek_M/Deepseek_M/Deepseek_M_basecolor.JPEG
```

初音未来的 GLB 由模型作者的 FBX 经同一脚本生成（`--height 0.98`），FBX 源文件未包含在本仓库中。

脚本会合并网格、减面到约 26 万三角面、把 8K 贴图缩到 4K 并导出 Y-up 的 GLB。`--height` 会把尺寸不同的角色统一缩放到应用内参考身高，不会修改源文件。

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
- **自定义模型连接失败**：检查模型设置页里的 Base URL、API Key 和模型 ID，并点「测试连接」。部分服务需要 `/v1` 后缀；Anthropic 使用 `x-api-key` 鉴权。
- Windows 启动即崩溃（报错含 GPU 字样）：启动器已自动禁用 DirectComposition 规避透明窗口崩溃；若仍崩溃，在启动命令末尾追加 `--no-sandbox`（编辑 `Lilith 桌宠.cmd` 最后一行，或执行 `npm start -- --no-sandbox`）。

## 说明

- Windows 支持为实验性质，但已在真实 Windows 11 机器上验证可用：透明点击穿透窗口在部分显卡驱动组合下需要禁用 DirectComposition 的兼容开关，程序在 Windows 上会自动加上。
- Windows 上其他应用全屏（游戏、视频）时，桌宠会自动隐藏，退出全屏后恢复——与 macOS 行为一致。
- 模型文件版权归原作者所有，请勿商用。
