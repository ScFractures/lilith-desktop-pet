# Lilith Desktop Pet

A desktop pet for macOS and Windows (experimental), built with Electron and Three.js. Lilith floats on your desktop, wanders around on her own, idles, sleeps at night — and chats with you through OpenAI-compatible or Anthropic APIs, including reasoning models.

[中文](README.zh-CN.md)

## Contents

```
Lilith-Desktop-Pet/
├── LilithPet/            # Electron app source (run npm install first)
├── Lilith 桌宠.app       # macOS double-click launcher (must stay next to LilithPet/)
├── Lilith 桌宠.cmd       # Windows launcher (double-click; must stay next to LilithPet/)
├── Lilith/               # original 3D model source (FBX + textures)
├── Deepseek_M/           # DeepSeek M model source (FBX + textures)
└── Miku/                 # Hatsune Miku source texture (FBX not bundled)
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
- Right-click the pet for the menu: size presets, 3D model, actions (pat, walk, spin, jump, greet, sleep), **Chat window**, **Model settings**, language, hide and quit. The tray menu offers the same chat and model settings entries.
- **Chat window** opens a separate conversation window. Pick a saved model from the menu at the top, send with Enter, stop a reply while it streams, or start a new chat. Replies stream in live; reasoning returned by the model is shown above the answer. The window remembers its size and position.
- **Model settings** keeps several endpoints side by side. Choose **OpenAI compatible** or **Anthropic**; both can enable a reasoning effort (OpenAI sends `reasoning_effort` or uses the Responses API, Anthropic enables extended thinking). Use **Fetch models** to load the endpoint's model list together with each model's supported reasoning depths (Anthropic reads the Models API capabilities; OpenAI depths are inferred from model IDs), and unsupported levels are disabled in the menu. You can also type the model ID manually. Then test the connection and save. Example base URLs: `https://api.deepseek.com/v1`, `https://api.anthropic.com`, or your local server.
- Custom models only chat by default. Edit a model and tick **Allow tool calls** to enable terminal and file tools for it in the chat window (`run_command`, `read_file`, `write_file`, `list_files`); calls appear as a collapsible group below the reply. Tools stay inside the **workspace** chosen in the chat window, and the **mode** menu sets permissions: **Read only** can view files and folders, **Read & write** can create and edit files but not run commands, and **Full access** can run terminal commands. Switching the mode or workspace keeps the current conversation.
- Switching the 3D model changes her local voice and persona. The model used by the chat window is chosen independently inside that window.
- Everything is available in Chinese and English: switch with the **Language** submenu in the right-click (or tray) menu. The default follows your system language. The pet, chat window and model settings page all update immediately.
- On macOS, **Avoid open windows** (right-click or tray menu, on by default) keeps her out of other apps' windows: walks stay within uncovered stretches of the screen bottom, she steps aside when a window covers her, and she hides while the whole bottom edge is occupied.

### Where data is stored

Settings, chat history and API keys stay on your computer in the OS application-data directory (`~/Library/Application Support/Lilith Pet/` on macOS):

- `pet-state.json` — pet position, size, selected 3D model, language and chat-window bounds
- `custom-models.json` — custom endpoints and their API keys (stored as plain text locally, never uploaded)
- `custom-chat.json` — conversation history

Messages go only to the Base URL of the custom model you selected. If you used an older build with `ai-config.json`, its endpoint is imported into `custom-models.json` on first launch.

## Models

Three models are included: the original Lilith (`LilithPet/assets/lilith.glb`), DeepSeek M (`LilithPet/assets/deepseek_m.glb`, source in `Deepseek_M/`) and Hatsune Miku (`LilithPet/assets/miku.glb`, source texture in `Miku/`). Switch between them in the **Model** submenu of the right-click or tray menu — the choice is saved locally and restored on the next launch.

Each model has its own standalone voice and AI persona: Lilith is gentle, poetic and playful; DeepSeek M has a calm, concise, analytical persona with a dry sense of humor; Miku is bright, musical and a little mischievous. Switching models swaps the AI system prompt and all local lines, and clears the current chat history.

To regenerate a GLB from its source file with Blender 4.x or newer:

```bash
Blender -b --python LilithPet/scripts/import_fbx_glb.py -- \
  Deepseek_M/Deepseek_M.fbx LilithPet/assets/deepseek_m.glb \
  --texture Deepseek_M/Deepseek_M/Deepseek_M_basecolor.JPEG
```

The Miku GLB was generated from the author's FBX with the same script and `--height 0.98`; the FBX source is not bundled in this repository.

The script joins the meshes, decimates to ~260k triangles, downscales the 8K atlas to 4K and exports a Y-up GLB. `--height` rescales characters authored at a different size to the in-app reference height. It never modifies the source files.

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
- **A custom model cannot connect** — check the Base URL, API key and model ID on the model settings page and use **Test connection**. Some providers require a `/v1` suffix; Anthropic keys are sent with `x-api-key`.
- The app crashes right after launch on Windows (GPU-related errors) — the launcher already disables DirectComposition to avoid this. If it still crashes, append `--no-sandbox` to the launch command: edit the last line of `Lilith 桌宠.cmd`, or run `npm start -- --no-sandbox`.

## Notes

- Windows support is experimental, but has been verified working on real Windows 11 hardware: the transparent click-through window requires a DirectComposition compatibility switch on some graphics stacks, which the app applies automatically on Windows.
- On Windows the pet hides itself while another app is fullscreen (games, videos) and comes back when you exit fullscreen — the same behavior as on macOS.
- Model assets (`Lilith/`) belong to the original artist. Do not use them commercially.
