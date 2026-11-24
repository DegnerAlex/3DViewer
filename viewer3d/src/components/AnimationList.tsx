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

import { useState } from "preact/hooks";
import { Button, Heading } from "react-bulma-components";
import { FiCheck, FiEdit2 } from "react-icons/fi";

interface AnimationListProps {
  animations: string[];
  selectedAnimations: boolean[];
  activeAnimation: number;
  isDark: boolean;
  onSelect: (index: number) => void;
  onToggle: (index: number) => void;
  onToggleAll: () => void;
  /** Live rename of a clip (applies to the viewer and future exports). */
  onRename: (index: number, name: string) => void;
}

/**
 * "Animations" section: select-all checkbox, one row per clip with an export
 * checkbox, a play button and an inline rename editor.
 */
export default function AnimationList({
  animations,
  selectedAnimations,
  activeAnimation,
  isDark,
  onSelect,
  onToggle,
  onToggleAll,
  onRename,
}: AnimationListProps) {
  // Rename editing is purely local UI state.
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renamingOriginal, setRenamingOriginal] = useState("");

  const allSelected =
    animations.length > 0 &&
    animations.every((_, index) => selectedAnimations[index] ?? true);

  const startRenaming = (index: number) => () => {
    setRenamingIndex(index);
    setRenamingOriginal(animations[index] ?? "");
  };

  const finishRenaming = () => {
    setRenamingIndex(null);
    setRenamingOriginal("");
  };

  const commitRenaming = (index: number) => () => {
    const name = animations[index] ?? "";
    // Never leave an empty clip name: restore the pre-edit value.
    if (!name.trim()) onRename(index, renamingOriginal);
    finishRenaming();
  };

  const cancelRenaming = (index: number) => () => {
    onRename(index, renamingOriginal);
    finishRenaming();
  };

  return (
    <>
      <div className="is-flex is-align-items-center mt-4 mb-2">
        {animations.length > 0 && (
          <label className="check mr-1" title="Include all animations in export">
            <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
            <span className="check-box">
              <FiCheck />
            </span>
          </label>
        )}
        <Heading
          size={6}
          renderAs="p"
          className={`is-flex-grow-1 mb-0 ${
            isDark ? "has-text-white" : "has-text-dark"
          }`}
        >
          Animations
        </Heading>
      </div>

      {animations.length === 0 && (
        <p
          className={`is-size-7 ${
            isDark ? "has-text-grey-light" : "has-text-grey"
          }`}
        >
          No animations
        </p>
      )}

      {animations.map((name, index) => (
        <div
          key={`animation-${index}`}
          className="is-flex is-align-items-center mb-2"
        >
          {renamingIndex === index ? (
            <input
              className="input is-small is-flex-grow-1"
              type="text"
              value={name}
              autoFocus
              onChange={(e) =>
                onRename(index, (e.target as HTMLInputElement).value)
              }
              onBlur={commitRenaming(index)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  cancelRenaming(index)();
                }
              }}
            />
          ) : (
            <>
              <label
                className="check mr-1"
                title="Include in export (GLB/glTF)"
              >
                <input
                  type="checkbox"
                  checked={selectedAnimations[index] ?? true}
                  onChange={() => onToggle(index)}
                />
                <span className="check-box">
                  <FiCheck />
                </span>
              </label>
              <Button
                className="animation-btn is-flex-grow-1 mr-1"
                fullwidth
                size="small"
                title={name}
                color={activeAnimation === index ? "info" : "dark"}
                onClick={() => onSelect(index)}
              >
                <span className="anim-name">{name}</span>
              </Button>
              <Button
                size="small"
                color="dark"
                className="rename-btn"
                title="Rename animation"
                onClick={startRenaming(index)}
              >
                <FiEdit2 />
              </Button>
            </>
          )}
        </div>
      ))}
    </>
  );
}
