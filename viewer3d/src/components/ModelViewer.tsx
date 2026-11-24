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

import { Component } from "preact";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { convertFbxToGlb } from "../lib/convertFbxToGlb";
import { exportModelBlob, type ExportFormat } from "../lib/exportModel";
import type { SceneView } from "../lib/session";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Heading, Notification } from "react-bulma-components";

export interface ModelViewerProps {
  /** URL of the model to preview (.glb or .fbx). */
  modelUrl: string;
  /**
   * Which loader to use. Inferred from the URL extension when omitted —
   * pass it explicitly for blob: URLs (dropped files have no extension).
   */
  modelKind?: "gltf" | "fbx";
  /** Index of the animation clip to play (pass -1 to stop). */
  animationIndex?: number;
  /** Called after a model is loaded with the display names of its animation clips. */
  onAnimations?: (names: string[]) => void;
  /** Scene background theme (default: "light"). */
  background?: "light" | "dark";
  /** Render the model as wireframe mesh instead of shaded surfaces. */
  wireframe?: boolean;
  /** Show the floor grid (default: true). */
  grid?: boolean;
  /** Called (throttled) whenever the camera/orbit target changes. */
  onViewChange?: (view: SceneView) => void;
  /** Camera pose to apply to the next loaded model (session restore). */
  initialView?: SceneView | null;
  /** Called after initialView has been applied (so the app can clear it). */
  onInitialViewApplied?: () => void;
}

const BACKGROUND_COLORS = {
  dark: 0x14161c,
  light: 0xeef0f4,
} as const;

const GRID_COLORS = {
  dark: { center: 0x3a3f4b, grid: 0x262a33 },
  light: { center: 0xb8bdc7, grid: 0xd4d8de },
} as const;

interface ModelState {
  loading: boolean;
  progress: number;
  error: string;
}

/**
 * Preview scene for a single 3D model. Loads .glb (GLTFLoader) or .fbx
 * (FBXLoader), auto-fits the model into the view, plays its first animation
 * clip (if any) and allows orbiting with the mouse.
 */
export default class ModelViewer extends Component<
  ModelViewerProps,
  ModelState
> {
  state: ModelState = {
    loading: false,
    progress: 0,
    error: "",
  };

  private container: HTMLDivElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private action: THREE.AnimationAction | null = null;
  private animations: THREE.AnimationClip[] = [];
  private currentModel: THREE.Object3D | null = null;
  private grid: THREE.GridHelper | null = null;
  private clock = new THREE.Clock();
  private frameId = 0;
  private resizeObserver: ResizeObserver | null = null;
  /** Current model's transform as produced by the loader, before fitAndAdd modified it. */
  private originalPosition = new THREE.Vector3();
  private originalScale = new THREE.Vector3(1, 1, 1);
  /** Transform applied by fitAndAdd, needed to undo it on export. */
  private fitPosition = new THREE.Vector3();
  private fitScale = 1;
  /** Camera pose set by fitAndAdd, restored by resetView(). */
  private fitCameraPos: THREE.Vector3 | null = null;
  private fitTarget = new THREE.Vector3();
  /** Camera pose of the empty scene (before any model was loaded). */
  private defaultCameraPos = new THREE.Vector3(2.2, 1.8, 3.2);

  /** Bumped on every load so stale responses can be ignored. */
  private loadToken = 0;

  /** Timestamp of the last throttled view notification. */
  private lastViewNotify = 0;

  // ── Lifecycle ───────────────────────────────────────────────────────────

  componentDidMount() {
    this.initScene();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    if (this.container) {
      this.resizeObserver.observe(this.container);
    }
    // Backup for platforms where ResizeObserver does not fire while the
    // window is being live-resized.
    window.addEventListener("resize", this.handleResize);

    this.loadModel(this.props.modelUrl);
    this.startLoop();
  }

  componentDidUpdate(prevProps: ModelViewerProps) {
    if (prevProps.modelUrl !== this.props.modelUrl) {
      this.loadModel(this.props.modelUrl);
    } else if (prevProps.animationIndex !== this.props.animationIndex) {
      this.playAnimation(this.props.animationIndex ?? -1);
    }
    if (prevProps.background !== this.props.background) {
      this.applyTheme();
    }
    if (prevProps.wireframe !== this.props.wireframe) {
      this.applyWireframe();
    }
    if (prevProps.grid !== this.props.grid) {
      this.applyGrid();
    }
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener("resize", this.handleResize);
    this.controls?.removeEventListener("change", this.handleControlsChange);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    this.clearModel();
    if (this.grid) {
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
      this.grid = null;
    }
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
  }

  // ── Public API (called from App via ref) ────────────────────────────────

  /**
   * Export the currently displayed model as a Blob in the given format.
   *
   * `animationIndices` limits which clips end up in the file (undefined =
   * all clips). Geometry-only formats ignore it — they cannot store
   * animations.
   *
   * The auto-fit transform is undone for the export (via a wrapper with the
   * inverse transform), so the file keeps the size/position the loader
   * produced — not the preview framing.
   */
  async exportModel(
    format: ExportFormat,
    animationIndices?: number[],
  ): Promise<Blob | null> {
    const model = this.currentModel;
    const scene = this.scene;
    if (!model || !scene) return null;

    const clips = animationIndices
      ? animationIndices
          .map((index) => this.animations[index])
          .filter((clip): clip is THREE.AnimationClip => Boolean(clip))
      : this.animations;

    // Identity original transform → no wrapper needed (common for glTF).
    const isIdentity =
      this.fitScale === 1 &&
      this.originalScale.equals(new THREE.Vector3(1, 1, 1)) &&
      this.originalPosition.equals(new THREE.Vector3());

    if (isIdentity) {
      return exportModelBlob(model, clips, format);
    }

    const wrapper = new THREE.Group();
    const uniformFit = new THREE.Vector3(this.fitScale, this.fitScale, this.fitScale);
    wrapper.scale.copy(this.originalScale).divide(uniformFit);
    wrapper.position
      .copy(this.originalPosition)
      .sub(wrapper.scale.clone().multiply(this.fitPosition));

    scene.add(wrapper);
    wrapper.add(model);
    try {
      return await exportModelBlob(wrapper, clips, format);
    } finally {
      // Restore the preview state regardless of success.
      scene.remove(wrapper);
      scene.add(model);
    }
  }

  /** Rename an animation clip by index (name is stored on the clip and used by exports). */
  renameAnimation(index: number, name: string) {
    const clip = this.animations[index];
    if (clip && name.trim()) {
      clip.name = name.trim();
    }
  }

  /** Reset the camera to the framing of the currently loaded model (or the empty-scene default). */
  resetView() {
    const camera = this.camera;
    const controls = this.controls;
    if (!camera || !controls) return;

    if (this.currentModel && this.fitCameraPos) {
      camera.position.copy(this.fitCameraPos);
      controls.target.copy(this.fitTarget);
    } else {
      camera.position.copy(this.defaultCameraPos);
      controls.target.set(0, 0, 0);
    }
    controls.update();
  }

  /** Apply a previously saved camera pose (used on session restore). */
  setView(view: SceneView) {
    const camera = this.camera;
    const controls = this.controls;
    if (!camera || !controls) return;

    // Reset the throttle BEFORE updating: the synchronous change event must
    // not be dropped, otherwise the fit pose would be reported instead.
    this.lastViewNotify = 0;
    camera.position.set(...view.position);
    controls.target.set(...view.target);
    controls.update();
  }

  /**
   * Render one fresh frame and return it as a data URL.
   *
   * preserveDrawingBuffer keeps the frame readable at any moment, but a
   * synchronous render right before reading makes the screenshot always
   * match what is on screen (including animations mid-frame).
   */
  screenshot(mime: "image/png" | "image/jpeg" = "image/png"): string | null {
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    if (!renderer || !scene || !camera) return null;

    renderer.render(scene, camera);
    return renderer.domElement.toDataURL(
      mime,
      mime === "image/jpeg" ? 0.92 : undefined,
    );
  }

  // ── Scene setup / rendering ─────────────────────────────────────────────

  private initScene() {
    const container = this.container;
    if (!container) return;

    this.scene = new THREE.Scene();
    this.applyTheme();

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    this.camera.position.set(2.2, 1.8, 3.2);
    this.defaultCameraPos.copy(this.camera.position);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      // WebKitGTK clears the WebGL surface during live window resize, which
      // makes the scene disappear. Keeping the drawing buffer preserves the
      // last frame while the compositor resizes.
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    Object.assign(this.renderer.domElement.style, {
      display: "block",
      width: "100%",
      height: "100%",
    });
    container.appendChild(this.renderer.domElement);

    // Lighting: neutral fill + key light + subtle blue rim from behind.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x30343f, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(3, 6, 4);
    this.scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x88aaff, 1.2);
    rimLight.position.set(-4, 2, -3);
    this.scene.add(rimLight);

    // The grid is created by applyTheme() (it also recreates it on theme
    // change); here we only apply the current visibility setting.
    this.applyGrid();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // Report view changes (throttled) so the app can persist the pose.
    this.controls.addEventListener("change", this.handleControlsChange);

    this.handleResize();
  }

  /** Apply the background/grid colors for the current theme. */
  private applyTheme() {
    const scene = this.scene;
    if (!scene) return;

    const theme = this.props.background ?? "light";
    scene.background = new THREE.Color(BACKGROUND_COLORS[theme]);

    if (this.grid) {
      scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
    }
    const gridColors = GRID_COLORS[theme];
    this.grid = new THREE.GridHelper(
      20,
      40,
      gridColors.center,
      gridColors.grid,
    );
    scene.add(this.grid);
    // Recreating the grid resets visibility — reapply the current setting.
    this.applyGrid();
  }

  /** Toggle wireframe rendering on every material of the current model. */
  private applyWireframe() {
    const model = this.currentModel;
    if (!model) return;

    const wireframe = this.props.wireframe ?? false;
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const materials = mesh.material
        ? Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        : [];
      for (const material of materials) {
        if ("wireframe" in material) {
          (material as THREE.MeshStandardMaterial).wireframe = wireframe;
        }
      }
    });
  }

  /** Show/hide the floor grid (kept in the scene, visibility only). */
  private applyGrid() {
    if (this.grid) {
      this.grid.visible = this.props.grid ?? true;
    }
  }

  private startLoop() {
    const animate = () => {
      this.frameId = requestAnimationFrame(animate);

      const delta = this.clock.getDelta();
      this.mixer?.update(delta);
      this.controls?.update();

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    animate();
  }

  // ── Model loading / management ──────────────────────────────────────────

  private loadModel(url: string) {
    const scene = this.scene;
    if (!scene) return;

    this.loadToken += 1;
    this.clearModel();

    // Empty URL = empty scene (no model loaded yet).
    if (!url) {
      this.animations = [];
      this.props.onAnimations?.([]);
      this.fitCameraPos = null;
      this.resetView();
      this.setState({ loading: false, progress: 0, error: "" });
      return;
    }

    this.setState({ loading: true, progress: 0, error: "" });
    const token = this.loadToken;

    const onProgress = (xhr: ProgressEvent) => {
      if (token !== this.loadToken) return;
      if (xhr.total > 0) {
        this.setState({
          progress: Math.round((xhr.loaded / xhr.total) * 100),
        });
      }
    };

    const onError = (err: unknown) => {
      if (token !== this.loadToken) return;
      this.setState({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    };

    const onLoaded = (object: THREE.Object3D, animations: THREE.AnimationClip[]) => {
      if (token !== this.loadToken) return;
      this.clearModel();
      this.fitAndAdd(object);
      this.applyWireframe();

      // Session restore: put the camera where it was last time.
      if (this.props.initialView) {
        console.debug("[viewer3d] applying saved view", this.props.initialView);
        this.setView(this.props.initialView);
        this.props.onInitialViewApplied?.();
      }

      this.animations = animations ?? [];
      this.props.onAnimations?.(
        this.animations.map((clip, index) => clip.name || `Animation ${index + 1}`),
      );
      this.playAnimation(this.props.animationIndex ?? 0);

      this.setState({ loading: false });
    };

    const isFbx = this.resolveKind() === "fbx";
    if (isFbx) {
      // FBX is normalized to GLB on the fly: load → GLTFExporter → blob URL,
      // then continue through the regular GLTF path below.
      convertFbxToGlb(url, onProgress)
        .then((glbUrl) => {
          new GLTFLoader().load(
            glbUrl,
            (gltf) => {
              URL.revokeObjectURL(glbUrl);
              onLoaded(gltf.scene, gltf.animations ?? []);
            },
            onProgress,
            (err) => {
              URL.revokeObjectURL(glbUrl);
              onError(err);
            },
          );
        })
        .catch(onError);
    } else {
      new GLTFLoader().load(
        url,
        (gltf) => onLoaded(gltf.scene, gltf.animations ?? []),
        onProgress,
        onError,
      );
    }
  }

  private resolveKind(): "gltf" | "fbx" {
    if (this.props.modelKind) return this.props.modelKind;
    return this.props.modelUrl.toLowerCase().endsWith(".fbx") ? "fbx" : "gltf";
  }

  /** Scale the model to a predictable size, put its feet on the grid and aim the camera at it. */
  private fitAndAdd(object: THREE.Object3D) {
    const scene = this.scene;
    const controls = this.controls;
    const camera = this.camera;
    if (!scene || !controls || !camera) return;

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2.4 / maxDim;

    // Remember the loader's transform so exportModel() can restore it.
    this.originalPosition.copy(object.position);
    this.originalScale.copy(object.scale);
    this.fitScale = scale;
    this.fitPosition.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    object.scale.setScalar(scale);
    object.position.copy(this.fitPosition);
    scene.add(object);
    this.currentModel = object;

    // Frame the whole model, leaving a little headroom.
    const radius = (size.length() * scale) / 2 || 1;
    const fitDist =
      (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.15;
    camera.position.set(fitDist * 0.55, fitDist * 0.6, fitDist);
    controls.target.set(0, (size.y * scale) / 2, 0);
    controls.update();

    // Remember the framing so resetView() can restore it, and reset the
    // throttle so the change event below is reported, not swallowed.
    this.fitCameraPos = camera.position.clone();
    this.fitTarget.copy(controls.target);
    this.lastViewNotify = 0;
  }

  // ── Animations ──────────────────────────────────────────────────────────

  /** Switch the playing animation clip (index -1 stops everything). */
  private playAnimation(index: number) {
    this.stopAnimation();
    const model = this.currentModel;
    const clip = this.animations[index];
    if (!model || !clip) return;

    this.mixer = new THREE.AnimationMixer(model);
    this.action = this.mixer.clipAction(clip);
    this.action.play();
  }

  private stopAnimation() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.action = null;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  private clearModel() {
    this.stopAnimation();
    this.animations = [];
    if (this.currentModel && this.scene) {
      this.scene.remove(this.currentModel);
      this.disposeObject(this.currentModel);
      this.currentModel = null;
    }
  }

  private disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();

      const materials = mesh.material
        ? Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        : [];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value && (value as THREE.Texture).isTexture) {
            (value as THREE.Texture).dispose();
          }
        }
        material.dispose();
      }
    });
  }

  // ── Resize ──────────────────────────────────────────────────────────────

  /** Throttled report of camera pose while orbiting. */
  private handleControlsChange = () => {
    const now = Date.now();
    if (now - this.lastViewNotify < 500) return;
    this.lastViewNotify = now;

    const camera = this.camera;
    const controls = this.controls;
    if (!camera || !controls) return;

    this.props.onViewChange?.({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
    });
  };

  private handleResize = () => {
    const container = this.container;
    const renderer = this.renderer;
    const camera = this.camera;
    if (!container || !renderer || !camera) return;

    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Redraw immediately: the rAF loop can stall during a live resize,
    // leaving the cleared buffer on screen.
    if (this.scene) {
      renderer.render(this.scene, camera);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  render() {
    const { loading, progress, error } = this.state;

    return (
      <div style="position: fixed; inset: 0; z-index: 0;">
        <div
          ref={(el) => {
            this.container = el;
          }}
          style="width: 100%; height: 100%;"
        />

        {loading && (
          <div
            class="is-flex is-justify-content-center is-align-items-center"
            style="position: absolute; inset: 0; pointer-events: none;"
          >
            <Heading
              size={5}
              renderAs="p"
              className={
                (this.props.background ?? "light") === "dark"
                  ? "has-text-grey-light"
                  : "has-text-grey"
              }
            >
              {progress > 0 ? `Loading… ${progress}%` : "Loading…"}
            </Heading>
          </div>
        )}

        {error && (
          <div style="position: absolute; left: 1rem; right: 1rem; bottom: 1rem;">
            <Notification color="danger" light>
              {error}
            </Notification>
          </div>
        )}
      </div>
    );
  }
}
