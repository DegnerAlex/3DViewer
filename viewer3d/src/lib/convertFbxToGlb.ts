import type { Group, Material, Object3D, Texture } from "three";
import { FileLoader } from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

/** Texture slots that may carry images on three.js materials. */
const TEXTURE_SLOTS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
  "alphaMap",
  "specularMap",
  "bumpMap",
  "displacementMap",
  "lightMap",
  "envMap",
] as const;

/**
 * Remove texture slots whose image never loaded.
 *
 * FBX files often reference textures by absolute paths from the author's
 * machine (e.g. /Users/.../_textures/foo.png). FBXLoader still creates a
 * Texture for each of them, but the image stays empty — and GLTFExporter
 * then fails with "No valid image data found. Unable to process texture."
 * Nulling those slots lets the export proceed with the material's base
 * color instead.
 */
function stripEmptyTextures(object: Object3D) {
  object.traverse((child) => {
    const mesh = child as {
      material?: Material | Material[];
      isMesh?: boolean;
    };
    const materials = mesh.material
      ? Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      : [];

    for (const material of materials) {
      let touched = false;
      for (const slot of TEXTURE_SLOTS) {
        const texture = (material as unknown as Record<string, Texture | null>)[
          slot
        ];
        if (texture && !texture.image) {
          (material as unknown as Record<string, Texture | null>)[slot] = null;
          touched = true;
        }
      }
      if (touched) {
        material.needsUpdate = true;
      }
    }
  });
}

/**
 * Load an .fbx file and convert it to a binary .glb blob in memory.
 *
 * The FBX is fetched as a buffer and parsed explicitly (instead of
 * FBXLoader.loadAsync) so that parse errors — which that helper cannot
 * report, they escape as uncaught exceptions — surface as a normal
 * rejected promise the UI can display.
 *
 * Animations are carried over: FBXLoader's AnimationClips are passed to
 * GLTFExporter, so the resulting GLB keeps every clip.
 *
 * The caller owns the returned blob: URL and must revokeObjectURL it when
 * done (the viewer does this as soon as the GLB has loaded).
 */
export async function convertFbxToGlb(
  url: string,
  onProgress?: (xhr: ProgressEvent) => void,
): Promise<string> {
  // Network errors reject properly through FileLoader.
  const buffer = await new FileLoader()
    .setResponseType("arraybuffer")
    .loadAsync(url, onProgress);

  // Parse errors must be caught here: FBXLoader.loadAsync cannot report them.
  let fbx: Group;
  try {
    const texturePath = url.substring(0, url.lastIndexOf("/") + 1);
    fbx = new FBXLoader().parse(buffer as ArrayBuffer, texturePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse FBX file: ${message}`);
  }

  stripEmptyTextures(fbx);

  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(fbx, {
    binary: true,
    animations: fbx.animations ?? [],
  });

  return URL.createObjectURL(
    new Blob([glb as unknown as BlobPart], { type: "model/gltf-binary" }),
  );
}
