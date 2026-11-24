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

import { convertFileSrc } from "@tauri-apps/api/core";

/** True when the frontend runs inside a Tauri webview. */
export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/**
 * Asset-protocol URL for a disk path.
 *
 * The query param makes each call a unique URL, so re-opening the same file
 * triggers a reload instead of being served from cache.
 */
export function assetUrl(path: string): string {
  return `${convertFileSrc(path)}?drop=${Date.now()}`;
}
