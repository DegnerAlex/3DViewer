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

/** Session persistence: last model + scene settings (localStorage). */

/** Saved camera pose: position + orbit target fully define the view angle. */
export interface SceneView {
  position: [number, number, number];
  target: [number, number, number];
}

export interface PersistedSettings {
  /** Absolute path of the last model loaded from disk (Tauri only). */
  modelPath?: string;
  background: "dark" | "light";
  wireframe: boolean;
  grid?: boolean;
  /** Camera pose to restore with the model. */
  view?: SceneView;
}

const STORAGE_KEY = "viewer3d.session";

export function loadSession(): PersistedSettings | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function saveSession(settings: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn("Failed to persist session:", err);
  }
}
