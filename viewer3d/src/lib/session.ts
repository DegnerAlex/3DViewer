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
