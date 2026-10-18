# Lilith Desktop Pet（莉莉丝桌宠）

[English](README.md)

一个基于 Electron 的桌面宠物（macOS，Windows 为实验性支持）：莉莉丝漂浮在桌面上，会自己走动、发呆、聊天。支持接入任意 OpenAI 兼容 API 进行 AI 对话。

## 目录结构

```
Lilith-Desktop-Pet/
├── LilithPet/            # Electron 应用源码（需要 npm install）
├── Lilith 桌宠.app       # macOS 双击启动器（需与 LilithPet 放在同一目录）
├── Lilith 桌宠.cmd       # Windows 双击启动器（需与 LilithPet 同目录）
├── Lilith/               # 原版 3D 模型源文件（FBX + 贴图）
└── Lilith_mao/           # 魔王（Maou）模型源文件（FBX + 贴图；目录沿用原文件名）
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
- 右键桌宠打开菜单：可以调整大小、切换模型、开关 AI 聊天、进入「AI 聊天设置」。
- 在 AI 聊天设置里填入 OpenAI 兼容接口的 Base URL、API Key 和模型名，点"测试连接"确认可用后保存。
- 聊天输入框在桌宠下方，回车发送。AI 配置只保存在你自己的电脑上（系统应用数据目录），不会上传。
- 界面和台词都做了中英双语：右键菜单（或托盘菜单）里的「语言」随时切换，默认跟随系统语言。

## 模型

应用内置两个模型：原版莉莉丝（`LilithPet/assets/lilith.glb`）和魔王版莉莉丝（`LilithPet/assets/lilith_maou.glb`，源文件在 `Lilith_mao/`）。在右键菜单或托盘菜单的「模型」里切换，选择会保存在本地，下次启动自动恢复。

如需用 Blender 4.x 或更高版本从 FBX 源文件重新生成 GLB：

```bash
Blender -b --python LilithPet/scripts/import_fbx_glb.py -- \
  Lilith_mao/Lilith_mao.fbx LilithPet/assets/lilith_maou.glb \
  --texture Lilith_mao/Lilith_mao/Lilith_mao_basecolor.JPEG
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
- Windows 启动即崩溃（报错含 GPU 字样）：启动器已自动禁用 DirectComposition 规避透明窗口崩溃；若仍崩溃，在启动命令末尾追加 `--no-sandbox`（编辑 `Lilith 桌宠.cmd` 最后一行，或执行 `npm start -- --no-sandbox`）。

## 说明

- Windows 支持为实验性质，但已在真实 Windows 11 机器上验证可用：透明点击穿透窗口在部分显卡驱动组合下需要禁用 DirectComposition 的兼容开关，程序在 Windows 上会自动加上。
- Windows 上其他应用全屏（游戏、视频）时，桌宠会自动隐藏，退出全屏后恢复——与 macOS 行为一致。
- 模型文件版权归原作者所有，请勿商用。
