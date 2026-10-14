# Lilith Desktop Pet（莉莉丝桌宠）

[English](README.md)

一个基于 Electron 的桌面宠物（macOS，Windows 为实验性支持）：莉莉丝漂浮在桌面上，会自己走动、发呆、聊天。支持接入任意 OpenAI 兼容 API 进行 AI 对话。

## 目录结构

```
Lilith-Desktop-Pet/
├── LilithPet/            # Electron 应用源码（需要 npm install）
├── Lilith 桌宠.app       # macOS 双击启动器（需与 LilithPet 放在同一目录）
├── Lilith 桌宠.cmd       # Windows 双击启动器（需与 LilithPet 同目录）
└── Lilith/               # 3D 模型资源（FBX + 贴图）
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
- 右键桌宠打开菜单：可以调整大小、开关 AI 聊天、进入「AI 聊天设置」。
- 在 AI 聊天设置里填入 OpenAI 兼容接口的 Base URL、API Key 和模型名，点"测试连接"确认可用后保存。
- 聊天输入框在桌宠下方，回车发送。AI 配置只保存在你自己的电脑上（系统应用数据目录），不会上传。

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

## 说明

- Windows 支持为实验性质：透明点击穿透窗口最初只在 macOS 上调校过，尚未在真实 Windows 上验证，欢迎反馈问题。
- 模型文件版权归原作者所有，请勿商用。
