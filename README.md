# 3D Viewer

A lightweight desktop 3D model viewer built with Tauri, Preact and three.js.
Open `.glb`, `.gltf` or `.fbx` models by drag & drop, from the file dialog or
straight from the command line, inspect their animations and export them.

<img width="800" height="600" alt="image" src="https://github.com/user-attachments/assets/0bf34669-9f13-448a-8850-c9288d36ab6d" />



## Features

### Opening models

- **Supported formats:** `.glb`, `.gltf` and `.fbx`.
- **Drag & drop** — drop a file anywhere in the window. Inside Tauri the
  native drag & drop API is used (reliable on WebKitGTK/Linux and provides
  absolute file paths); in the browser a regular HTML5 drop is handled.
- **Open button** — native file dialog with a format filter.
- **Command line** — `viewer3d /path/to/model.fbx`. If the app is already
  running, the file is forwarded to the running window instead of starting
  a second instance (single-instance mode). A positional argument is the
  model path; the optional `--screenshot` flag saves a JPG next to the
  model (see Screenshots).
- **FBX normalization** — FBX files are converted to binary GLB in memory
  (via `FBXLoader` + `GLTFExporter`) before rendering, so animations and
  materials travel through one pipeline. Textures referenced by broken
  absolute paths (a common FBX artifact) are dropped automatically;
  the material keeps its base color.
- **Empty scene by default** — no bundled demo models; the app starts clean.
  A hint in the panel explains how to load a model.

### Animations

- All animation clips of the model are listed in the sidebar; click to play
  one, the first clip autoplays after loading.
- **Inline renaming** — click the pencil icon next to a clip, edit the name
  live (`Enter` applies, `Esc` reverts). Renamed clips keep their new names
  in GLB/glTF exports.
- **Export selection** — a checkbox next to every clip (and a select-all
  checkbox in the section header) controls which clips are written to the
  exported file. Geometry-only formats (OBJ/STL/PLY/USDZ) cannot store
  animations at all.

### Scene

- **Light / dark background** — switches the scene background, the floor
  grid colors and the UI panel (Breeze light/dark palettes).
- **Mesh (wireframe)** — renders the model as a wireframe instead of shaded
  surfaces.
- **Plane** — shows/hides the floor grid.
- **Auto-fit** — every model is scaled to a predictable size, centered on
  the grid and framed by the camera on load; orbiting/zooming via mouse.
- **Session restore** — the last model (opened from disk), its camera pose
  (position + orbit target, i.e. the exact viewing angle) and all scene
  settings are restored on the next launch. Files that were deleted since
  are skipped gracefully.

### Export & screenshots

- **Export formats:** GLB, glTF (JSON), OBJ, STL, PLY, USDZ — via the format
  dropdown next to the Save button.
- GLB/glTF exports keep **animations** (only the selected clips) and
  **renamed clip titles**; the model is exported in its original size and
  orientation, not the preview framing.
- Saving uses the native dialog in Tauri; a regular download in the browser.
  The UI is blocked with a progress overlay while the export runs.
- **Screenshot button** — saves the current view as a PNG in the original
  window resolution (up to 2x with device pixel ratio).
- **CLI screenshot** — `viewer3d /path/to/model.glb --screenshot` saves a
  JPG named after the model (`<model>.jpg`) right next to it, without any
  interaction.

### UI

- Styled after **Breeze**, the KDE Plasma theme (buttons, dropdowns,
  checkboxes, notifications, scrollbars), with light/dark variants.
- Splash screen with the app logo and a spinner while the UI loads.
- Error notifications (e.g. a broken FBX file) are shown in the window;
  the app keeps running.

## Development

Everything runs in Docker — no local Rust or Node installation is required.

**Prerequisites:** Docker + Docker Compose; for the desktop window an X11 or
Wayland session and a GPU are used directly from the host.

Start the dev environment (frontend dev server + Tauri window with hot reload):

```sh
docker compose up
```

This builds two images on first run and starts two services:

| Service     | What it does                                            |
| ----------- | ------------------------------------------------------- |
| `frontend`  | Vite dev server on `http://localhost:1420` (hot reload) |
| `viewer3d`  | `cargo tauri dev` — the desktop window (WebKitGTK, X11) |



## Download

Prebuilt Linux bundles (AppImage, deb, rpm) are available on the
[releases page](https://github.com/DegnerAlex/3DViewer/releases).

## Libraries

- [Tauri](https://tauri.app/) — desktop shell (Rust + system webview);
  plugins: `dialog`, `fs`, `cli`, `single-instance`
- [three.js](https://threejs.org/) — WebGL rendering, loaders (GLTF/FBX) and
  exporters (GLTF/OBJ/STL/PLY/USDZ)
- [Preact](https://preactjs.com/) — UI framework
- [Bulma](https://bulma.io/) +
  [react-bulma-components](https://react-bulma-components.js.org/) — UI styling
  and widgets, re-themed to Breeze (KDE Plasma) in `src/App.scss`
- [react-icons](https://react-icons.github.io/react-icons/) — icon set
- [Vite](https://vite.dev/) — bundler/dev server; [TypeScript](https://www.typescriptlang.org/)
- [Sass](https://sass-lang.com/) — styles preprocessor
