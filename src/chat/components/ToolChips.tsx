/**
 * Row of clickable tool chips above the input.
 */

import { Accessor, For } from 'solid-js';
import type { McpTool } from '../../types.js';
import './ToolChips.css';

export function ToolChips(props: { tools: Accessor<McpTool[]>; onChipClick: (tool: McpTool) => void }) {
  return (
    <div id="chips">
      <For each={props.tools()}>
        {(tool) => (
          <button
            type="button"
            class="chip"
            title={tool.description}
            onClick={() => props.onChipClick(tool)}
          >
            {tool.name}
          </button>
        )}
      </For>
    </div>
  );
}
