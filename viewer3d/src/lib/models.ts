/** Shared model-related types and helpers. */

/** File extensions accepted via drag & drop, dialog or CLI. */
export const SUPPORTED_PATTERN = /\.(glb|gltf|fbx)$/i;

export interface CustomModel {
  name: string;
  url: string;
  /** Absolute path on disk, when the model came from one (Tauri only). */
  path?: string;
}

/** Last path segment, tolerating both unix and windows separators. */
export function pathBasename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Loader hint for a model name (blob files have no usable extension). */
export function modelKindFromName(name: string): "fbx" | "gltf" {
  return name.toLowerCase().endsWith(".fbx") ? "fbx" : "gltf";
}

/** File name of the model without its extension, for export defaults. */
export function modelStem(name: string): string {
  return name.replace(SUPPORTED_PATTERN, "");
}
