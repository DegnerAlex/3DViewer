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
