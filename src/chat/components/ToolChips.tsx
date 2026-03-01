/**
 * Row of clickable tool chips above the input.
 */

import { type Accessor, For } from 'solid-js';
import { Chip } from '../../shared/components/Chip';
import type { McpTool } from '../../types.js';
import './ToolChips.css';

export function ToolChips(props: {
  tools: Accessor<McpTool[]>;
  onChipClick: (tool: McpTool) => void;
}) {
  return (
    <div id="chips">
      <For each={props.tools()}>
        {(tool) => (
          <Chip
            label={tool.name}
            title={tool.description}
            onClick={() => props.onChipClick(tool)}
          />
        )}
      </For>
    </div>
  );
}
