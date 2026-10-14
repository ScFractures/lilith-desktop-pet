# Lilith Desktop Pet

A desktop pet for macOS, built with Electron and Three.js. Lilith floats on your desktop, wanders around on her own, idles, sleeps at night — and chats with you through any OpenAI-compatible API.

[中文](README.zh-CN.md)

## Contents

```
Lilith-Desktop-Pet/
├── LilithPet/            # Electron app source (run npm install first)
├── Lilith 桌宠.app       # Double-click launcher (must stay next to LilithPet/)
└── Lilith/               # 3D model assets (FBX + textures)
```

## Getting started

[Node.js](https://nodejs.org/) 18+ is required.

```bash
cd LilithPet
npm install
```

To launch:

- Double-click `Lilith 桌宠.app` (the bundle locates `LilithPet/` next to itself), or
- run `npm start` inside `LilithPet/`.

If macOS blocks the app on first launch ("unidentified developer"), open System Settings → Privacy & Security and click "Open Anyway", or right-click the app and choose Open.

## Usage

- Drag the pet to move her; left alone, she walks around, idles, and occasionally talks.
- Right-click the pet for the menu: size presets, actions (chat, pat, walk, spin, jump, greet, sleep) and AI Chat Settings.
- Open AI Chat Settings, fill in the Base URL, API Key and model name of any OpenAI-compatible endpoint, use the test button, then save.
- The chat input appears under the pet; press Enter to send, Escape to close. The AI config is stored locally only (under macOS Application Support), and messages go only to the endpoint you configured.

## Notes

- The in-app UI is currently in Chinese.
- Model assets (`Lilith/`) belong to the original artist. Do not use them commercially.
