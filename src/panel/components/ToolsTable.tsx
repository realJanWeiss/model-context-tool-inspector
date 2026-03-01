/**
 * Tools table with copy buttons.
 */

import { type Accessor, For, Show } from 'solid-js';
import type { McpTool } from '../../types.js';

function cellContent(tool: McpTool, key: keyof McpTool): string {
  const val = tool[key];
  try {
    return JSON.stringify(JSON.parse(val as string), null, '  ');
  } catch {
    return val ?? '';
  }
}

function toolKeys(tools: McpTool[]): Array<keyof McpTool> {
  const first = tools[0];
  if (!first) return [];
  return Object.keys(first) as Array<keyof McpTool>;
}

export function ToolsTable(props: {
  tools: Accessor<McpTool[]>;
  statusMsg: Accessor<string>;
  toolsUrl: Accessor<string>;
  onCopyAsScriptToolConfig: () => void;
  onCopyAsJSON: () => void;
}) {
  return (
    <>
      <Show when={props.statusMsg()}>
        <div id="status">{props.statusMsg()}</div>
      </Show>

      <div class="table-container">
        <table id="resultsTable">
          <thead>
            <Show when={props.tools().length > 0}>
              <tr>
                <For each={toolKeys(props.tools())}>
                  {(key) => <th>{key}</th>}
                </For>
              </tr>
            </Show>
          </thead>
          <tbody>
            <Show
              when={props.tools().length > 0}
              fallback={
                <tr>
                  <td colspan="100%">
                    <i>
                      No tools registered yet
                      {props.toolsUrl() ? ` in ${props.toolsUrl()}` : ''}
                    </i>
                  </td>
                </tr>
              }
            >
              <For each={props.tools()}>
                {(tool) => (
                  <tr>
                    <For each={toolKeys(props.tools())}>
                      {(key) => (
                        <td>
                          <pre>{cellContent(tool, key)}</pre>
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>
        <Show when={props.tools().length > 0}>
          <div id="copyToClipboard">
            <span
              id="copyAsScriptToolConfig"
              onClick={props.onCopyAsScriptToolConfig}
            >
              📝 Copy as ScriptToolConfig
            </span>
            <span id="copyAsJSON" onClick={props.onCopyAsJSON}>
              📝 Copy as JSON
            </span>
          </div>
        </Show>
      </div>
    </>
  );
}
