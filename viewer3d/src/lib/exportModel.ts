import type { AnimationClip, Object3D } from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { PLYExporter } from "three/addons/exporters/PLYExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";

/** Supported export formats. glb is the default (keeps animations). */
export type ExportFormat = "glb" | "gltf" | "obj" | "stl" | "ply" | "usdz";

export const EXPORT_FORMATS: Array<{ id: ExportFormat; label: string }> = [
  { id: "glb", label: "GLB (binary)" },
  { id: "gltf", label: "glTF (JSON)" },
  { id: "obj", label: "OBJ" },
  { id: "stl", label: "STL" },
  { id: "ply", label: "PLY" },
  { id: "usdz", label: "USDZ" },
];

/**
 * Serialize a model (and, for glTF-based formats, its animation clips) to a
 * Blob ready for saving to disk.
 *
 * Geometry-only formats (OBJ/STL/PLY/USDZ) ignore animations: their formats
 * cannot store them.
 */
export async function exportModelBlob(
  object: Object3D,
  animations: AnimationClip[],
  format: ExportFormat,
): Promise<Blob> {
  switch (format) {
    case "glb": {
      const data = await new GLTFExporter().parseAsync(object, {
        binary: true,
        animations,
      });
      return new Blob([data as unknown as BlobPart], { type: "model/gltf-binary" });
    }

    case "gltf": {
      const json = await new GLTFExporter().parseAsync(object, {
        binary: false,
        animations,
      });
      return new Blob([JSON.stringify(json, null, 2)], {
        type: "model/gltf+json",
      });
    }

    case "obj": {
      const text = new OBJExporter().parse(object);
      return new Blob([text], { type: "text/plain" });
    }

    case "stl": {
      const data = new STLExporter().parse(object, { binary: true });
      return new Blob([data as unknown as BlobPart], {
        type: "application/octet-stream",
      });
    }

    case "ply": {
      const data = await new Promise<ArrayBuffer>((resolve) => {
        const immediate = new PLYExporter().parse(object, resolve, {
          binary: true,
        });
        if (immediate) resolve(immediate as ArrayBuffer);
      });
      return new Blob([data], { type: "application/octet-stream" });
    }

    case "usdz": {
      const data = await new USDZExporter().parseAsync(object);
      return new Blob([data as unknown as BlobPart], { type: "model/vnd.usdz+zip" });
    }
  }
}
