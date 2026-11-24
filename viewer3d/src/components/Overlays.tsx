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

import { Heading } from "react-bulma-components";

/** Fullscreen hint shown while the user drags a model over the window. */
export function DragOverlay() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(10, 12, 16, 0.6)",
        border: "2px dashed rgba(255, 255, 255, 0.5)",
        borderRadius: "10px",
        margin: "0.75rem",
        pointerEvents: "none",
      }}
    >
      <Heading size={4} renderAs="p" className="has-text-white">
        Drop a 3D model (.glb, .gltf, .fbx)
      </Heading>
    </div>
  );
}

/** Fullscreen blocking overlay with an indeterminate progress bar while exporting. */
export function ExportOverlay({ isDark }: { isDark: boolean }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        backgroundColor: isDark
          ? "rgba(35, 38, 41, 0.78)"
          : "rgba(239, 240, 241, 0.78)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        pointerEvents: "auto",
        cursor: "wait",
      }}
    >
      <Heading
        size={5}
        renderAs="p"
        className={isDark ? "has-text-white" : "has-text-dark"}
      >
        Exporting model…
      </Heading>
      <div style={{ width: "240px" }}>
        <progress className="progress is-small is-primary" max={100} />
      </div>
    </div>
  );
}
