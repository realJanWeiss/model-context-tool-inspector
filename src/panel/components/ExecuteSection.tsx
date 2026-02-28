/**
 * Manual tool execution: tool selector, input args, execute button, result output.
 */

import { Accessor, For } from 'solid-js';
import type { McpTool } from '../../types.js';

export function ExecuteSection(props: {
  tools: Accessor<McpTool[]>;
  selectedToolName: Accessor<string>;
  inputArgs: Accessor<string>;
  toolResult: Accessor<string>;
  executing: Accessor<boolean>;
  onToolSelect: (name: string) => void;
  onInputArgsChange: (value: string) => void;
  onExecute: () => void;
}) {
  const noTools = () => props.tools().length === 0;

  return (
    <>
      <div class="form-group">
        <label for="toolNames">Tool</label>
        <select
          id="toolNames"
          disabled={noTools()}
          value={props.selectedToolName()}
          onChange={(e) => props.onToolSelect(e.currentTarget.value)}
        >
          <For each={props.tools()}>
            {(tool) => <option value={tool.name}>"{tool.name}"</option>}
          </For>
        </select>
      </div>

      <div class="form-group">
        <label for="inputArgsText">Input Arguments</label>
        <textarea
          id="inputArgsText"
          disabled={noTools()}
          value={props.inputArgs()}
          onInput={(e) => props.onInputArgsChange(e.currentTarget.value)}
        />
      </div>

      <div class="form-group">
        <button
          id="executeBtn"
          disabled={noTools() || props.executing()}
          onClick={props.onExecute}
        >
          Execute Tool
        </button>
      </div>

      <pre id="toolResults">{props.toolResult()}</pre>
    </>
  );
}
