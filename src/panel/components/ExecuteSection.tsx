/**
 * Manual tool execution: tool selector, input args, execute button, result output.
 */

import { Accessor, For } from 'solid-js';
import type { McpTool } from '../../types.js';
import { FormField } from './FormField.js';
import { ResultPane } from './ResultPane.js';

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
      <FormField label="Tool" for="toolNames">
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
      </FormField>

      <FormField label="Input Arguments" for="inputArgsText">
        <textarea
          id="inputArgsText"
          disabled={noTools()}
          value={props.inputArgs()}
          onInput={(e) => props.onInputArgsChange(e.currentTarget.value)}
        />
      </FormField>

      <div class="form-group">
        <button
          id="executeBtn"
          disabled={noTools() || props.executing()}
          onClick={props.onExecute}
        >
          Execute Tool
        </button>
      </div>

      <ResultPane id="toolResults" content={props.toolResult} />
    </>
  );
}
