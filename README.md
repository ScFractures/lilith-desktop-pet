# Lilith Desktop Pet

A desktop pet for macOS and Windows (experimental), built with Electron and Three.js. Lilith floats on your desktop, wanders around on her own, idles, sleeps at night — and chats with you through the local Qoder CLI or any OpenAI-compatible / Anthropic endpoint, with streaming replies, reasoning, and tool calls.

[中文](README.zh-CN.md)

## Contents

```
Lilith-Desktop-Pet/
├── LilithPet/            # Electron app source (run npm install first)
├── Lilith 桌宠.app       # macOS double-click launcher (must stay next to LilithPet/)
├── Lilith 桌宠.cmd       # Windows launcher (double-click; must stay next to LilithPet/)
├── Lilith/               # original 3D model source (FBX + textures)
├── Lilith_mao/           # Maou (魔王) model source (FBX + textures; keeps the original folder name)
└── Deepseek_M/           # DeepSeek M model source (FBX + textures)
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
- Right-click the pet for the menu: **Qoder chat…**, Qoder balance, size presets, 3D model, actions (pat, walk, spin, jump, greet, sleep), language, hide and quit.
- **Qoder chat…** opens the conversation window. Pick a model at the top, choose a permission mode and workspace, then send with Enter. Replies stream in live, the model's reasoning appears in a collapsible **Reasoning** panel, and **Stop** interrupts a reply. The dot next to **New chat** shows whether a Qoder session is connected.
- Tool calls are grouped into one collapsed **Tool calls** row so they never cover the reasoning. Expand the row to list each call, then expand a call to see its input and result. The row shows the active tool while running and the failure count if a call fails.
- **Qoder models** run the local Qoder CLI in the selected workspace, so they can read files, run commands and edit code. Permission modes control what is allowed: **YOLO** runs tools without confirmation — make sure the workspace is correct before using it. If the Qoder CLI is not installed you can still use custom models.
- **Add model** opens the model settings page. Custom models can use any OpenAI-compatible endpoint (Chat Completions or the Responses API) or the Anthropic Messages API. Fetch the model list and each model's supported reasoning depths automatically, or type the model ID manually; test the connection, then save. Custom models appear in the chat window's model menu and call the endpoint directly — Qoder tools, permission modes and workspaces do not apply to them.
- **New chat** clears the current conversation from the window and starts a fresh session.
- Everything is available in Chinese and English: switch with the **Language** submenu in the right-click (or tray) menu. The default follows your system language. The pet, chat window and model settings page all update immediately.
- **Qoder balance** in the right-click menu asks Lilith to read the local Qoder CLI quota (Qoder login required) and say how many credits remain.

### Where data is stored

Settings, chat history and API keys stay on your computer in the OS application-data directory (`~/Library/Application Support/Lilith Pet/` on macOS):

- `pet-state.json` — pet position, size, selected 3D model, language and window bounds
- `custom-models.json` — custom endpoints and their API keys (stored as plain text locally, never uploaded)
- `qoder-chat.json` — conversation history
- `qoder-models.json` — cached Qoder model list
- `qoder-balance.json` — cached Qoder quota

Messages go only to the provider you selected: the Qoder CLI for Qoder models, or the Base URL of the custom model you picked.

## Models

Three 3D models are included: the original Lilith (`LilithPet/assets/lilith.glb`), Lilith Maou (`LilithPet/assets/lilith_maou.glb`, source in `Lilith_mao/`) and DeepSeek M (`LilithPet/assets/deepseek_m.glb`, source in `Deepseek_M/`). Switch between them in the **Model** submenu of the right-click or tray menu — the choice is saved locally and restored on the next launch.

Each model has its own local voice and persona: Lilith (Classic and Maou) is gentle, poetic and playful; DeepSeek M is a calm, concise, analytical assistant with a dry sense of humor. Switching models swaps her local lines and persona. The model used by the Qoder chat window is selected independently inside that window.

To regenerate a GLB from its FBX source with Blender 4.x or newer:

```bash
Blender -b --python LilithPet/scripts/import_fbx_glb.py -- \
  Lilith_mao/Lilith_mao.fbx LilithPet/assets/lilith_maou.glb \
  --texture Lilith_mao/Lilith_mao/Lilith_mao_basecolor.JPEG

Blender -b --python LilithPet/scripts/import_fbx_glb.py -- \
  Deepseek_M/Deepseek_M.fbx LilithPet/assets/deepseek_m.glb \
  --texture Deepseek_M/Deepseek_M/Deepseek_M_basecolor.JPEG
```

The script joins the meshes, decimates to ~260k triangles, downscales the 8K atlas to 4K and exports a Y-up GLB. It never modifies the source files.

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
- **Qoder CLI was not found / Qoder runs fail** — install and sign in to the Qoder CLI, and make sure it is at `~/.qoder-cn/entry/qoder-cn`, or point `QODERCN_CLI` at the executable. Custom models work without it.
- **A custom model cannot connect** — check the Base URL, API key and model ID on the model settings page and use **Test connection**. Some providers require a `/v1` suffix; Anthropic keys are sent with `x-api-key`.
- The app crashes right after launch on Windows (GPU-related errors) — the launcher already disables DirectComposition to avoid this. If it still crashes, append `--no-sandbox` to the launch command: edit the last line of `Lilith 桌宠.cmd`, or run `npm start -- --no-sandbox`.

## Notes

- Windows support is experimental, but has been verified working on real Windows 11 hardware: the transparent click-through window requires a DirectComposition compatibility switch on some graphics stacks, which the app applies automatically on Windows.
- On Windows the pet hides itself while another app is fullscreen (games, videos) and comes back when you exit fullscreen — the same behavior as on macOS.
- Model assets (`Lilith/`) belong to the original artist. Do not use them commercially.
