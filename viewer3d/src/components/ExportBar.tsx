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

import type { ExportFormat } from "../lib/exportModel";
import { EXPORT_FORMATS } from "../lib/exportModel";
import { Button } from "react-bulma-components";

interface ExportBarProps {
  exportFormat: ExportFormat;
  exporting: boolean;
  onFormatChange: (format: ExportFormat) => void;
  onExport: () => void;
}

/** Format dropdown + save button, shown while a model is loaded. */
export default function ExportBar({
  exportFormat,
  exporting,
  onFormatChange,
  onExport,
}: ExportBarProps) {
  return (
    <div className="is-flex is-align-items-center mt-4">
      <div className="select is-small mr-2 is-flex-grow-1">
        <select
          value={exportFormat}
          disabled={exporting}
          onChange={(e) =>
            onFormatChange((e.target as HTMLSelectElement).value as ExportFormat)
          }
        >
          {EXPORT_FORMATS.map((format) => (
            <option key={format.id} value={format.id}>
              {format.label}
            </option>
          ))}
        </select>
      </div>
      <Button
        size="small"
        color="primary"
        disabled={exporting}
        onClick={onExport}
      >
        {exporting ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
