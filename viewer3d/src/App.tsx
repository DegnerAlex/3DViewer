import { Component, createRef } from "preact";
import {
  getCurrentWebview,
  type DragDropEvent,
} from "@tauri-apps/api/webview";
import { save, open } from "@tauri-apps/plugin-dialog";
import { exists, writeFile } from "@tauri-apps/plugin-fs";
import { getMatches } from "@tauri-apps/plugin-cli";
import { listen } from "@tauri-apps/api/event";
import "./App.scss";
import ModelViewer from "./components/ModelViewer";
import ControlPanel from "./components/ControlPanel";
import { DragOverlay, ExportOverlay } from "./components/Overlays";
import {
  SUPPORTED_PATTERN,
  modelKindFromName,
  modelStem,
  pathBasename,
  type CustomModel,
} from "./lib/models";
import { assetUrl, isTauriRuntime } from "./lib/tauri";
import { loadSession, saveSession } from "./lib/session";
import type { ExportFormat } from "./lib/exportModel";

interface AppProps {}

interface AppState {
  /** Last model opened via drop, dialog or CLI, if any. */
  customModel: CustomModel | null;
  animations: string[];
  activeAnimation: number;
  dragActive: boolean;
  /** Scene background theme. */
  background: "dark" | "light";
  /** Render the model as wireframe mesh. */
  wireframe: boolean;
  /** Format for the Save button (glb by default). */
  exportFormat: ExportFormat;
  /** True while an export is running. */
  exporting: boolean;
  /** Per-animation checkbox: include the clip in the next export. */
  selectedAnimations: boolean[];
}

export default class App extends Component<AppProps, AppState> {
  state: AppState = {
    customModel: null,
    animations: [],
    activeAnimation: 0,
    dragActive: false,
    background: "light",
    wireframe: false,
    exportFormat: "glb",
    exporting: false,
    selectedAnimations: [],
  };

  /** Ref to the viewer, used for the imperative export/rename calls. */
  private viewerRef = createRef<ModelViewer>();

  /** Nested dragenter/dragleave events need counting, otherwise the overlay flickers. */
  private dragDepth = 0;

  /** Unlisten function for Tauri's native drag & drop events. */
  private unlistenDragDrop: (() => void) | null = null;

  /** Unlisten function for CLI args forwarded by the single-instance plugin. */
  private unlistenCli: (() => void) | null = null;

  componentDidMount() {
    // Fade out and remove the static splash screen from index.html.
    const splash = document.getElementById("splash");
    if (splash) {
      splash.classList.add("splash-hide");
      window.setTimeout(() => splash.remove(), 300);
    }

    if (isTauriRuntime()) {
      // WebKitGTK (Linux) does not populate dataTransfer.files on HTML5 drop
      // events, so inside Tauri the native drag & drop API is used instead.
      void this.setupTauriDragDrop();
      // Command line: open a model passed as `viewer3d model.fbx`.
      void this.setupTauriCli();
    } else {
      window.addEventListener("dragenter", this.handleDragEnter);
      // dragover must be prevented, otherwise the browser cancels the drop.
      window.addEventListener("dragover", this.handleDragOver);
      window.addEventListener("dragleave", this.handleDragLeave);
      window.addEventListener("drop", this.handleDrop);
    }

    // Last model + scene settings from the previous run.
    this.restoreSession();
  }

  componentWillUnmount() {
    if (isTauriRuntime()) {
      this.unlistenDragDrop?.();
      this.unlistenDragDrop = null;
      this.unlistenCli?.();
      this.unlistenCli = null;
    } else {
      window.removeEventListener("dragenter", this.handleDragEnter);
      window.removeEventListener("dragover", this.handleDragOver);
      window.removeEventListener("dragleave", this.handleDragLeave);
      window.removeEventListener("drop", this.handleDrop);
    }
    this.revokeCustomModel();
  }

  componentDidUpdate(
    _prevProps: AppProps,
    prevState: Readonly<AppState>,
  ): void {
    // Remember the model and scene settings as soon as any of them changes.
    if (
      prevState.background !== this.state.background ||
      prevState.wireframe !== this.state.wireframe ||
      prevState.customModel !== this.state.customModel
    ) {
      const { customModel, background, wireframe } = this.state;
      saveSession({
        background,
        wireframe,
        modelPath: customModel?.path,
      });
    }
  }

  // ── Session ────────────────────────────────────────────────────────────

  /**
   * Restore the persisted session: scene settings always, the model only
   * when it was loaded from a disk path (Tauri) — blob URLs from dropped
   * files cannot survive a restart.
   */
  private restoreSession() {
    const saved = loadSession();
    if (!saved) return;

    const modelPath = saved.modelPath;
    if (isTauriRuntime() && modelPath && SUPPORTED_PATTERN.test(modelPath)) {
      // The file might have been deleted since the last run.
      void exists(modelPath)
        .then((fileExists) => {
          if (!fileExists) return;
          this.loadCustomModel(
            pathBasename(modelPath),
            assetUrl(modelPath),
            modelPath,
          );
        })
        .catch((err) => console.warn("Failed to restore model:", err));
    }

    this.setState({
      background: saved.background === "dark" ? "dark" : "light",
      wireframe: Boolean(saved.wireframe),
    });
  }

  // ── Scene ──────────────────────────────────────────────────────────────

  /** Reset: unload the model and restore default scene settings. */
  private handleReset = () => {
    this.revokeCustomModel();
    this.setState({
      customModel: null,
      background: "light",
      wireframe: false,
    });
    // The viewer clears the model, animations and camera on its own when the
    // URL becomes empty (onAnimations fires with []).
  };

  private handleBackgroundSelect = (background: "dark" | "light") => {
    this.setState({ background });
  };

  private handleWireframeToggle = () => {
    this.setState(({ wireframe }) => ({ wireframe: !wireframe }));
  };

  // ── Animations ─────────────────────────────────────────────────────────

  private handleAnimations = (names: string[]) => {
    this.setState({
      animations: names,
      activeAnimation: names.length > 0 ? 0 : -1,
      // Every newly loaded model starts with all clips selected for export.
      selectedAnimations: names.map(() => true),
    });
  };

  private handleAnimationSelect = (index: number) => {
    this.setState({ activeAnimation: index });
  };

  private handleAnimationToggle = (index: number) => {
    this.setState(({ selectedAnimations }) => {
      const next = selectedAnimations.slice();
      next[index] = !next[index];
      return { selectedAnimations: next };
    });
  };

  private handleToggleAllAnimations = () => {
    const { animations, selectedAnimations } = this.state;
    const allSelected = animations.every(
      (_, index) => selectedAnimations[index] ?? true,
    );
    this.setState({ selectedAnimations: animations.map(() => !allSelected) });
  };

  /** Live rename: updates both the panel and the AnimationClip in the viewer. */
  private handleRename = (index: number, name: string) => {
    this.viewerRef.current?.renameAnimation(index, name);
    this.setState(({ animations }) => {
      const next = animations.slice();
      next[index] = name;
      return { animations: next };
    });
  };

  // ── Model sources ──────────────────────────────────────────────────────

  /** Common path for every way a model enters the app (drop, dialog, picker). */
  private loadCustomModel(name: string, url: string, path?: string) {
    this.revokeCustomModel();
    this.setState({ customModel: { name, url, path } });
  }

  /**
   * Command line interface.
   *
   * First launch: `viewer3d /path/model.fbx` — the cli plugin exposes the
   * positional argument, and the model is opened through the asset protocol.
   * Subsequent launches: the single-instance plugin (Rust side) forwards the
   * whole argv of the new process as a `cli-args` event, so the running
   * window loads the model instead of starting a second app.
   */
  private async setupTauriCli() {
    try {
      const matches = await getMatches();
      const raw = matches.args._?.value;
      const positionals = Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [];
      const path = positionals.find(
        (value): value is string =>
          typeof value === "string" && SUPPORTED_PATTERN.test(value),
      );
      if (path) {
        this.loadCustomModel(pathBasename(path), assetUrl(path), path);
      }
    } catch (err) {
      console.warn("Failed to parse CLI arguments:", err);
    }

    this.unlistenCli = await listen<string[]>("cli-args", (event) => {
      const path = event.payload.find((value) =>
        SUPPORTED_PATTERN.test(value),
      );
      if (!path) return;

      this.loadCustomModel(pathBasename(path), assetUrl(path), path);
    });
  }

  /** Open button: native file dialog (Tauri runtime only). */
  private handleOpenDialog = async () => {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "3D models", extensions: ["glb", "gltf", "fbx"] }],
      });
      if (typeof path !== "string") return;

      this.loadCustomModel(pathBasename(path), assetUrl(path), path);
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  /** Browser file-picker result (no dataTransfer on <input>, but same blob URL flow). */
  private handleOpenFile = (file: File) => {
    this.loadCustomModel(file.name, URL.createObjectURL(file));
  };

  // ── Export ─────────────────────────────────────────────────────────────

  private handleExportFormat = (format: ExportFormat) => {
    this.setState({ exportFormat: format });
  };

  private handleExport = async () => {
    const viewer = this.viewerRef.current;
    const { exportFormat, customModel, animations, selectedAnimations } = this.state;
    if (!viewer) return;

    const exportIndices = animations
      .map((_, index) => index)
      .filter((index) => selectedAnimations[index] ?? true);

    this.setState({ exporting: true });
    try {
      const blob = await viewer.exportModel(exportFormat, exportIndices);
      if (!blob) return;

      // Derive the file name from the loaded model, keeping the source stem.
      const fileName = `${customModel ? modelStem(customModel.name) : "model"}.${exportFormat}`;

      if (isTauriRuntime()) {
        await this.saveViaTauri(blob, fileName, exportFormat);
      } else {
        downloadBlob(blob, fileName);
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      this.setState({ exporting: false });
    }
  };

  /** Native save dialog + file write (works on WebKitGTK, unlike <a download>). */
  private async saveViaTauri(blob: Blob, fileName: string, format: ExportFormat) {
    const path = await save({
      defaultPath: fileName,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (!path) return;

    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  }

  // ── Drag & drop ────────────────────────────────────────────────────────

  private handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    this.dragDepth += 1;
    this.setState({ dragActive: true });
  };

  private handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  private handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) {
      this.setState({ dragActive: false });
    }
  };

  private handleDrop = (e: DragEvent) => {
    e.preventDefault();
    this.dragDepth = 0;
    this.setState({ dragActive: false });

    const file = Array.from(e.dataTransfer?.files ?? []).find((f) =>
      SUPPORTED_PATTERN.test(f.name),
    );
    if (!file) return;

    // The previous blob URL is no longer needed once the new model loads.
    this.loadCustomModel(file.name, URL.createObjectURL(file));
  };

  private revokeCustomModel() {
    if (this.state.customModel) {
      URL.revokeObjectURL(this.state.customModel.url);
    }
  }

  /** Native Tauri drag & drop: reliable on WebKitGTK, gives absolute file paths. */
  private async setupTauriDragDrop() {
    try {
      this.unlistenDragDrop = await getCurrentWebview().onDragDropEvent(
        (event: { payload: DragDropEvent }) => {
          const payload = event.payload;

          if (payload.type === "enter" || payload.type === "over") {
            this.setState({ dragActive: true });
          } else if (payload.type === "leave") {
            this.setState({ dragActive: false });
          } else if (payload.type === "drop") {
            this.setState({ dragActive: false });

            const path = payload.paths.find((p) => SUPPORTED_PATTERN.test(p));
            if (!path) return;

            this.loadCustomModel(pathBasename(path), assetUrl(path), path);
          }
        },
      );
    } catch (err) {
      console.error("Failed to listen for drag & drop events:", err);
    }
  }

  render() {
    const {
      customModel,
      animations,
      activeAnimation,
      dragActive,
      background,
      wireframe,
      exportFormat,
      exporting,
      selectedAnimations,
    } = this.state;

    const isDark = background === "dark";

    return (
      <div className={isDark ? "breeze-dark" : "breeze-light"}>
        {/* Full-window canvas behind the UI */}
        <ModelViewer
          ref={this.viewerRef}
          modelUrl={customModel ? customModel.url : ""}
          modelKind={
            customModel ? modelKindFromName(customModel.name) : undefined
          }
          animationIndex={activeAnimation}
          onAnimations={this.handleAnimations}
          background={background}
          wireframe={wireframe}
        />

        <ControlPanel
          isDark={isDark}
          customModel={customModel}
          animations={animations}
          activeAnimation={activeAnimation}
          selectedAnimations={selectedAnimations}
          wireframe={wireframe}
          exportFormat={exportFormat}
          exporting={exporting}
          onOpenDialog={this.handleOpenDialog}
          onOpenFile={this.handleOpenFile}
          onReset={this.handleReset}
          onBackground={this.handleBackgroundSelect}
          onWireframeToggle={this.handleWireframeToggle}
          onAnimationSelect={this.handleAnimationSelect}
          onAnimationToggle={this.handleAnimationToggle}
          onToggleAllAnimations={this.handleToggleAllAnimations}
          onRename={this.handleRename}
          onExportFormat={this.handleExportFormat}
          onExport={this.handleExport}
        />

        {dragActive && <DragOverlay />}
        {exporting && <ExportOverlay isDark={isDark} />}
      </div>
    );
  }
}

/** Browser fallback: trigger a file download via a temporary <a> element. */
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
