// Copyright 2026 Alex Degner (alex@ergofox.me)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
