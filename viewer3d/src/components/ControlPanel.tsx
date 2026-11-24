import { useRef } from "preact/hooks";
import { Button, Heading } from "react-bulma-components";
import {
  FiFolder,
  FiGrid,
  FiMoon,
  FiRotateCcw,
  FiSun,
} from "react-icons/fi";
import AnimationList from "./AnimationList";
import ExportBar from "./ExportBar";
import {
  SUPPORTED_PATTERN,
  type CustomModel,
} from "../lib/models";
import type { ExportFormat } from "../lib/exportModel";
import { isTauriRuntime } from "../lib/tauri";

interface ControlPanelProps {
  isDark: boolean;
  customModel: CustomModel | null;
  animations: string[];
  activeAnimation: number;
  selectedAnimations: boolean[];
  wireframe: boolean;
  exportFormat: ExportFormat;
  exporting: boolean;
  onOpenDialog: () => void;
  onOpenFile: (file: File) => void;
  onReset: () => void;
  onBackground: (background: "dark" | "light") => void;
  onWireframeToggle: () => void;  onAnimationSelect: (index: number) => void;
  onAnimationToggle: (index: number) => void;
  onToggleAllAnimations: () => void;
  onRename: (index: number, name: string) => void;
  onExportFormat: (format: ExportFormat) => void;
  onExport: () => void;
}

/** Floating panel with all viewer controls. */
export default function ControlPanel({
  isDark,
  customModel,
  animations,
  activeAnimation,
  selectedAnimations,
  wireframe,
  exportFormat,
  exporting,
  onOpenDialog,
  onOpenFile,
  onReset,
  onBackground,
  onWireframeToggle,
  onAnimationSelect,
  onAnimationToggle,
  onToggleAllAnimations,
  onRename,
  onExportFormat,
  onExport,
}: ControlPanelProps) {
  /** Hidden file input for the browser fallback of the open button. */
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenClick = () => {
    if (isTauriRuntime()) {
      onOpenDialog();
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFilePicked = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = Array.from(input.files ?? []).find((f) =>
      SUPPORTED_PATTERN.test(f.name),
    );
    input.value = ""; // allow re-picking the same file
    if (file) onOpenFile(file);
  };

  return (
    <div
      className="p-4"
      style={{
        position: "fixed",
        top: "1rem",
        left: "1rem",
        zIndex: 10,
        width: "280px",
        maxHeight: "calc(100vh - 2rem)",
        overflowY: "auto",
        overflowX: "hidden",
        backgroundColor: isDark
          ? "rgba(35, 38, 41, 0.82)"
          : "rgba(239, 240, 241, 0.82)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderRadius: "8px",
        border: isDark
          ? "1px solid rgba(252, 252, 252, 0.14)"
          : "1px solid rgba(35, 38, 41, 0.2)",
        boxShadow: "0 4px 18px rgba(0, 0, 0, 0.25)",
      }}
    >
      {/* Header: model name, reset and open buttons */}
      <div className="is-flex is-align-items-center mb-4">
        <Heading
          size={5}
          renderAs="h2"
          subtitle
          title={customModel ? customModel.name : undefined}
          className={`panel-title is-flex-grow-1 mb-0 ${
            isDark ? "has-text-grey-light" : "has-text-grey"
          }`}
        >
          {customModel ? customModel.name : "Choose model"}
        </Heading>
        {customModel && (
          <Button
            size="small"
            color="dark"
            className="ml-2"
            title="Reset scene (unload model, restore defaults)"
            onClick={onReset}
          >
            <FiRotateCcw />
          </Button>
        )}
        <Button
          size="small"
          color="dark"
          className="ml-2"
          title="Open model (.glb, .gltf, .fbx)"
          onClick={handleOpenClick}
        >
          <FiFolder />
        </Button>
      </div>

      {/* Scene settings: background theme + wireframe */}
      <div className="is-flex mb-4">
        <Button
          size="small"
          color={isDark ? "primary" : "dark"}
          className="mr-2 is-flex-grow-1"
          onClick={() => onBackground("dark")}
        >
          <FiMoon className="btn-icon" /> Dark
        </Button>
        <Button
          size="small"
          color={!isDark ? "primary" : "dark"}
          className="is-flex-grow-1"
          onClick={() => onBackground("light")}
        >
          <FiSun className="btn-icon" /> Light
        </Button>
        <Button
          size="small"
          color={wireframe ? "info" : "dark"}
          className="ml-2 is-flex-grow-1"
          onClick={onWireframeToggle}
        >
          <FiGrid className="btn-icon" /> Mesh
        </Button>
      </div>

      {!customModel && (
        <p
          className={`mb-2 is-size-7 ${
            isDark ? "has-text-grey-light" : "has-text-grey"
          }`}
        >
          Open or drop a .glb / .gltf / .fbx file to load it
        </p>
      )}

      {/* Hidden file picker for the browser fallback of the open button */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,.fbx"
        style="display: none"
        onChange={handleFilePicked}
      />

      <AnimationList
        key={customModel?.url ?? "empty"}
        animations={animations}
        selectedAnimations={selectedAnimations}
        activeAnimation={activeAnimation}
        isDark={isDark}
        onSelect={onAnimationSelect}
        onToggle={onAnimationToggle}
        onToggleAll={onToggleAllAnimations}
        onRename={onRename}
      />

      {customModel && (
        <ExportBar
          exportFormat={exportFormat}
          exporting={exporting}
          onFormatChange={onExportFormat}
          onExport={onExport}
        />
      )}
    </div>
  );
}
