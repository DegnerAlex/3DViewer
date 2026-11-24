import type { Material, Mesh, Object3D, Texture } from "three";
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
    const mesh = child as Mesh;
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
        (material as Material).needsUpdate = true;
      }
    }
  });
}

/**
 * Load an .fbx file and convert it to a binary .glb blob in memory.
 *
 * Animations are carried over: FBXLoader's AnimationClips are passed to
 * GLTFExporter, so the resulting GLB keeps every clip (verified by feeding
 * the returned URL back into GLTFLoader).
 *
 * The caller owns the returned blob: URL and must revokeObjectURL it when
 * done (the viewer does this as soon as the GLB has loaded).
 */
export async function convertFbxToGlb(
  url: string,
  onProgress?: (xhr: ProgressEvent) => void,
): Promise<string> {
  const fbx = await new FBXLoader().loadAsync(url, onProgress);
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
