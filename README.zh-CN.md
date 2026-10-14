# Lilith Desktop Pet（莉莉丝桌宠）

[English](README.md)

一个基于 Electron 的 macOS 桌面宠物：莉莉丝漂浮在桌面上，会自己走动、发呆、聊天。支持接入任意 OpenAI 兼容 API 进行 AI 对话。

## 目录结构

```
Lilith-Desktop-Pet/
├── LilithPet/            # Electron 应用源码（需要 npm install）
├── Lilith 桌宠.app       # 双击启动器（需与 LilithPet 放在同一目录）
└── Lilith/               # 3D 模型资源（FBX + 贴图）
```

## 运行

需要先安装 [Node.js](https://nodejs.org/)（建议 18+）。

```bash
cd LilithPet
npm install
```

安装完成后：

- 双击 `Lilith 桌宠.app` 启动（.app 会自动找到同目录下的 LilithPet）；
- 或在 `LilithPet/` 目录下执行 `npm start`。

首次打开 `Lilith 桌宠.app` 如果被 macOS 拦截（"无法验证开发者"），在"系统设置 → 隐私与安全性"里点"仍要打开"，或右键图标选择"打开"。

## 使用

- 拖拽桌宠可以移动位置，它会随机四处走动。
- 右键桌宠打开菜单：可以调整大小、开关 AI 聊天、进入「AI 聊天设置」。
- 在 AI 聊天设置里填入 OpenAI 兼容接口的 Base URL、API Key 和模型名，点"测试连接"确认可用后保存。
- 聊天输入框在桌宠下方，回车发送。AI 配置只保存在你自己的电脑上（macOS 应用支持目录），不会上传。

## 说明

- 模型文件版权归原作者所有，请勿商用。
