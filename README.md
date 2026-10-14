# Lilith Desktop Pet

A desktop pet for macOS and Windows (experimental), built with Electron and Three.js. Lilith floats on your desktop, wanders around on her own, idles, sleeps at night — and chats with you through any OpenAI-compatible API.

[中文](README.zh-CN.md)

## Contents

```
Lilith-Desktop-Pet/
├── LilithPet/            # Electron app source (run npm install first)
├── Lilith 桌宠.app       # macOS double-click launcher (must stay next to LilithPet/)
├── Lilith 桌宠.cmd       # Windows launcher (double-click; must stay next to LilithPet/)
└── Lilith/               # 3D model assets (FBX + textures)
```

## Getting started

### 1. Install Node.js

Node.js 18 or newer is required — download it from [nodejs.org](https://nodejs.org/), or use a package manager:

```bash
brew install node                  # macOS (Homebrew)
winget install OpenJS.NodeJS.LTS   # Windows (winget)
```

Check the installation:

```bash
node -v    # should print v18.x or newer
```

### 2. Clone this repository

```bash
git clone https://github.com/ScFractures/lilith-desktop-pet.git
cd lilith-desktop-pet
```

No Git installed? On the repository page click **Code → Download ZIP**, then unzip it instead.

### 3. Install dependencies

```bash
cd LilithPet
npm install
```

Make sure you are inside `LilithPet/` — the repository root has no `package.json`.

### 4. Launch

On macOS:

```bash
npm start
```

or double-click `Lilith 桌宠.app` (the bundle locates `LilithPet/` next to itself).

On Windows (experimental):

```bash
npm start
```

or double-click `Lilith 桌宠.cmd`.

If macOS blocks the app on first launch ("unidentified developer"), open System Settings → Privacy & Security and click "Open Anyway", or right-click the app and choose Open.

## Usage

- Drag the pet to move her; left alone, she walks around, idles, and occasionally talks.
- Right-click the pet for the menu: size presets, actions (chat, pat, walk, spin, jump, greet, sleep) and AI Chat Settings.
- Open AI Chat Settings, fill in the Base URL, API Key and model name of any OpenAI-compatible endpoint, use the test button, then save.
- The chat input appears under the pet; press Enter to send, Escape to close. The AI config is stored locally only (under the OS application data directory), and messages go only to the endpoint you configured.

## Troubleshooting

- `npm error code ENOENT ... Could not read package.json` — npm is running in the wrong folder. Run `cd LilithPet` first; the repository root has no `package.json`.
- `npm` hangs, or fails with `ETIMEDOUT` / `ECONNRESET` (especially during the `electron` postinstall step) — the default npm registry and the Electron binary are slow or unreachable on some networks. Switch to a mirror:

  ```bash
  npm config set registry https://registry.npmmirror.com
  npm config set electron_mirror https://npmmirror.com/mirrors/electron/
  ```

  then delete `node_modules` and run `npm install` again.
- `Error: Electron failed to install correctly` — same cause as above: configure the mirror, delete `node_modules`, reinstall.
- `'npm' is not recognized` (Windows) — Node.js is not installed, or the terminal was not reopened after installing it. Install Node.js 18+, open a new terminal, and check `node -v`.

## Notes

- The in-app UI is currently in Chinese.
- Windows support is experimental: the transparent click-through window was tuned on macOS first and has not been verified on real Windows hardware yet — bug reports are welcome.
- Model assets (`Lilith/`) belong to the original artist. Do not use them commercially.
