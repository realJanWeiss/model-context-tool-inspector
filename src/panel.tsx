/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createChatCompletion,
  generateTemplateFromSchema,
  getFormattedDate,
  getSystemInstruction,
  initLMStudio,
  normalizeInputArgs,
  stringifyContent,
  toOpenAITools,
} from './lmstudio.js';
import type { ChatMessage, McpTool, ToolsPayload } from './types.js';
import { createSignal, For, Show } from 'solid-js';
import { render } from 'solid-js/web';

// In a DevTools panel the inspected tab ID is always available synchronously.
const tabId = chrome.devtools.inspectedWindow.tabId;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

(async () => {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'LIST_TOOLS' });
  } catch {
    // will surface via onMessage error payload
  }
})();

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [tools, setTools] = createSignal<McpTool[]>([]);
  const [statusMsg, setStatusMsg] = createSignal('');
  const [toolsUrl, setToolsUrl] = createSignal('');

  const [lmReady, setLmReady] = createSignal(false);
  const [userPrompt, setUserPrompt] = createSignal('');
  const [promptLog, setPromptLog] = createSignal('');
  const [trace, setTrace] = createSignal<unknown[]>([]);
  const [lastSuggestedPrompt, setLastSuggestedPrompt] = createSignal('');
  const [userPromptPendingId, setUserPromptPendingId] = createSignal(0);

  const [selectedToolName, setSelectedToolName] = createSignal('');
  const [inputArgs, setInputArgs] = createSignal('');
  const [toolResult, setToolResult] = createSignal('');
  const [executing, setExecuting] = createSignal(false);

  const [panelCollapsed, setPanelCollapsed] = createSignal(false);
  const [interactCollapsed, setInteractCollapsed] = createSignal(false);

  // ── Init LM Studio ────────────────────────────────────────────────────────

  void initLMStudio().then(() => setLmReady(true));

  // ── Tool list updates ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener(async (payload: ToolsPayload, sender) => {
    if (sender.tab && sender.tab.id !== tabId) return;

    const { message, tools: newTools, url } = payload;
    setStatusMsg(message ?? '');
    setToolsUrl(url ?? '');

    const incoming = newTools ?? [];
    const oldJson = JSON.stringify(tools());
    setTools(incoming);
    if (JSON.stringify(incoming) !== oldJson) {
      void suggestUserPrompt();
    }

    if (incoming.length > 0 && selectedToolName() === '') {
      setSelectedToolName(incoming[0]?.name ?? '');
      updateDefaultInputArgs(incoming[0]);
    }
  });

  // ── Copy helpers ──────────────────────────────────────────────────────────

  async function copyAsScriptToolConfig(): Promise<void> {
    const text = tools()
      .map(
        (tool) =>
          `script_tools {\n  name: "${tool.name}"\n  description: "${tool.description}"\n  input_schema: ${JSON.stringify(tool.inputSchema ?? { type: 'object', properties: {} })}\n}`,
      )
      .join('\r\n');
    await navigator.clipboard.writeText(text);
  }

  async function copyAsJSON(): Promise<void> {
    const list = tools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
        ? (JSON.parse(tool.inputSchema) as object)
        : { type: 'object', properties: {} },
    }));
    await navigator.clipboard.writeText(JSON.stringify(list, null, '  '));
  }

  // ── Prompt / AI agent loop ────────────────────────────────────────────────

  function logPrompt(text: string): void {
    setPromptLog((prev) => `${prev}${text}\n`);
  }

  async function promptAI(): Promise<void> {
    const message = userPrompt().trim();
    if (!message) return;

    setUserPrompt('');
    setLastSuggestedPrompt('');
    logPrompt(`User prompt: "${message}"`);

    const messages: ChatMessage[] = [
      { role: 'system', content: getSystemInstruction() },
      { role: 'user', content: message },
    ];
    const openAITools = toOpenAITools(tools());
    setTrace((prev) => [...prev, { userPrompt: { message, tools: openAITools } }]);

    let finalResponseGiven = false;
    while (!finalResponseGiven) {
      const response = await createChatCompletion(messages, openAITools);
      setTrace((prev) => [...prev, { response }]);
      const assistantMessage = response.choices[0]?.message;
      if (!assistantMessage) {
        logPrompt(`⚠️ AI response is missing a message: ${JSON.stringify(response)}`);
        return;
      }

      const functionCalls = assistantMessage.tool_calls ?? [];
      messages.push({
        role: 'assistant',
        content: assistantMessage.content ?? '',
        tool_calls: functionCalls,
      });

      if (functionCalls.length === 0) {
        if (!assistantMessage.content) {
          logPrompt(`⚠️ AI response has no text: ${JSON.stringify(response)}`);
        } else {
          logPrompt(`AI result: ${assistantMessage.content.trim()}`);
        }
        finalResponseGiven = true;
      } else {
        for (const functionCall of functionCalls) {
          const name = functionCall.function.name;
          const rawArgs = functionCall.function.arguments ?? '{}';
          if (!name) {
            logPrompt(`⚠️ Malformed tool call from AI: ${JSON.stringify(functionCall)}`);
            continue;
          }
          const args = normalizeInputArgs(rawArgs);
          logPrompt(`AI calling tool "${name}" with ${args}`);
          try {
            const result = await chrome.tabs.sendMessage(tabId, {
              action: 'EXECUTE_TOOL',
              name,
              inputArgs: args,
            });
            logPrompt(`Tool "${name}" result: ${String(result)}`);
            messages.push({
              role: 'tool',
              tool_call_id: functionCall.id,
              content: stringifyContent({ result }),
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logPrompt(`⚠️ Error executing tool "${name}": ${msg}`);
            messages.push({
              role: 'tool',
              tool_call_id: functionCall.id,
              content: stringifyContent({ error: msg }),
            });
          }
        }
      }
    }
  }

  async function handlePromptSubmit(): Promise<void> {
    try {
      await promptAI();
    } catch (error) {
      setTrace((prev) => [...prev, { error }]);
      logPrompt(`⚠️ Error: "${String(error)}"`);
    }
  }

  function resetPrompt(): void {
    setTrace([]);
    setUserPrompt('');
    setLastSuggestedPrompt('');
    setPromptLog('');
    void suggestUserPrompt();
  }

  async function copyTrace(): Promise<void> {
    await navigator.clipboard.writeText(JSON.stringify(trace(), null, ' '));
  }

  async function suggestUserPrompt(): Promise<void> {
    if (tools().length === 0 || userPrompt() !== lastSuggestedPrompt()) return;
    const id = userPromptPendingId() + 1;
    setUserPromptPendingId(id);
    const response = await createChatCompletion([
      {
        role: 'system',
        content: [
          `Today's date is: ${getFormattedDate()}`,
          'Generate one natural user query for the available tools.',
          'Keep it concise and output query text only.',
        ].join('\n'),
      },
      { role: 'user', content: `Available tools:\n${JSON.stringify(tools())}` },
    ]);
    if (id !== userPromptPendingId() || userPrompt() !== lastSuggestedPrompt()) return;
    const suggestion = response.choices[0]?.message.content?.trim();
    if (!suggestion) return;
    setLastSuggestedPrompt(suggestion);
    setUserPrompt('');
    for (const chunk of suggestion) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      setUserPrompt((prev) => prev + chunk);
    }
  }

  // ── Manual tool execution ─────────────────────────────────────────────────

  function updateDefaultInputArgs(tool: McpTool | undefined): void {
    if (!tool) return;
    const schema = tool.inputSchema ? (JSON.parse(tool.inputSchema) as object) : {};
    setInputArgs(JSON.stringify(generateTemplateFromSchema(schema), null, ' '));
  }

  function onToolSelect(name: string): void {
    setSelectedToolName(name);
    const tool = tools().find((t) => t.name === name);
    updateDefaultInputArgs(tool);
  }

  async function executeTool(): Promise<void> {
    setExecuting(true);
    setToolResult('');
    const name = selectedToolName();
    try {
      const result = await chrome.tabs.sendMessage(tabId, {
        action: 'EXECUTE_TOOL',
        name,
        inputArgs: inputArgs(),
      });
      if (result !== null) {
        setToolResult(String(result));
      } else {
        await waitForPageLoad(tabId);
        const crossResult = await chrome.tabs.sendMessage(tabId, {
          action: 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT',
        });
        setToolResult(String(crossResult));
      }
    } catch (e) {
      setToolResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExecuting(false);
    }
  }

  // ── Table helpers ─────────────────────────────────────────────────────────

  function toolKeys(): Array<keyof McpTool> {
    const first = tools()[0];
    if (!first) return [];
    return Object.keys(first) as Array<keyof McpTool>;
  }

  function cellContent(tool: McpTool, key: keyof McpTool): string {
    const val = tool[key];
    try {
      return JSON.stringify(JSON.parse(val as string), null, '  ');
    } catch {
      return val ?? '';
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div class="container">
      {/* ── Tools table section ── */}
      <h2
        class="collapsible-header"
        classList={{ collapsed: panelCollapsed() }}
        onClick={() => setPanelCollapsed((v) => !v)}
      >
        WebMCP Tools
      </h2>
      <div class="section-content" classList={{ 'is-hidden': panelCollapsed() }}>
        <Show when={statusMsg()}>
          <div id="status">{statusMsg()}</div>
        </Show>

        <div class="table-container">
          <table id="resultsTable">
            <thead>
              <Show when={tools().length > 0}>
                <tr>
                  <For each={toolKeys()}>
                    {(key) => <th>{key}</th>}
                  </For>
                </tr>
              </Show>
            </thead>
            <tbody>
              <Show
                when={tools().length > 0}
                fallback={
                  <tr>
                    <td colspan="100%">
                      <i>No tools registered yet{toolsUrl() ? ` in ${toolsUrl()}` : ''}</i>
                    </td>
                  </tr>
                }
              >
                <For each={tools()}>
                  {(tool) => (
                    <tr>
                      <For each={toolKeys()}>
                        {(key) => <td><pre>{cellContent(tool, key)}</pre></td>}
                      </For>
                    </tr>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
          <Show when={tools().length > 0}>
            <div id="copyToClipboard">
              <span id="copyAsScriptToolConfig" onClick={() => void copyAsScriptToolConfig()}>
                📝 Copy as ScriptToolConfig
              </span>
              <span id="copyAsJSON" onClick={() => void copyAsJSON()}>
                📝 Copy as JSON
              </span>
            </div>
          </Show>
        </div>
      </div>

      {/* ── Interact section ── */}
      <h2
        class="collapsible-header"
        classList={{ collapsed: interactCollapsed() }}
        onClick={() => setInteractCollapsed((v) => !v)}
      >
        Interact with the Page
      </h2>
      <div class="section-content" classList={{ 'is-hidden': interactCollapsed() }}>

        <div class="form-group">
          <label for="userPromptText">User Prompt</label>
          <textarea
            id="userPromptText"
            value={userPrompt()}
            onInput={(e) => setUserPrompt(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                void handlePromptSubmit();
              }
            }}
          />
        </div>

        <div class="form-group">
          <button disabled={!lmReady()} onClick={() => void handlePromptSubmit()}>Send</button>
          <button class="secondary" disabled={!lmReady()} onClick={resetPrompt}>Reset</button>
          <button class="secondary" onClick={() => void copyTrace()}>Copy trace</button>
        </div>

        <pre id="promptResults">{promptLog()}</pre>

        <div class="form-group">
          <label for="toolNames">Tool</label>
          <select
            id="toolNames"
            disabled={tools().length === 0}
            value={selectedToolName()}
            onChange={(e) => onToolSelect(e.currentTarget.value)}
          >
            <For each={tools()}>
              {(tool) => <option value={tool.name}>"{tool.name}"</option>}
            </For>
          </select>
        </div>

        <div class="form-group">
          <label for="inputArgsText">Input Arguments</label>
          <textarea
            id="inputArgsText"
            disabled={tools().length === 0}
            value={inputArgs()}
            onInput={(e) => setInputArgs(e.currentTarget.value)}
          />
        </div>

        <div class="form-group">
          <button
            id="executeBtn"
            disabled={tools().length === 0 || executing()}
            onClick={() => void executeTool()}
          >
            Execute Tool
          </button>
        </div>

        <pre id="toolResults">{toolResult()}</pre>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function waitForPageLoad(id: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ── Mount ─────────────────────────────────────────────────────────────────────

render(() => <App />, document.getElementById('app')!);
