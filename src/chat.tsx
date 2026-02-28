/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createChatCompletion,
  getSystemInstruction,
  initLMStudio,
  normalizeInputArgs,
  stringifyContent,
  toOpenAITools,
} from './lmstudio.js';
import type { ChatMessage, McpTool, ToolsPayload } from './types.js';
import { createSignal, For, Show } from 'solid-js';
import { render } from 'solid-js/web';

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = 'user' | 'ai' | 'tool-call';

interface UserMsg {
  role: 'user';
  text: string;
}

interface AiMsg {
  role: 'ai';
  text: string;
}

interface ToolCallMsg {
  role: 'tool-call';
  name: string;
  args: string;
  result: string | null; // null = still pending
}

type Msg = UserMsg | AiMsg | ToolCallMsg;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

void initLMStudio();

(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      await chrome.tabs.sendMessage(tab.id, { action: 'LIST_TOOLS' });
    }
  } catch {
    // content script not ready yet — tools will arrive once page loads
  }
})();

// ── App component ─────────────────────────────────────────────────────────────

function App() {
  const [tools, setTools] = createSignal<McpTool[]>([]);
  const [messages, setMessages] = createSignal<Msg[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [inputValue, setInputValue] = createSignal('');

  // ── Tool list updates from content script ──────────────────────────────────

  chrome.runtime.onMessage.addListener(async (payload: ToolsPayload, sender) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (sender.tab && sender.tab.id !== tab?.id) return;
    if (!payload.tools) return;
    setTools(payload.tools);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function appendMsg(msg: Msg): number {
    const idx = messages().length;
    setMessages((prev) => [...prev, msg]);
    return idx;
  }

  function updateMsg(idx: number, updater: (m: Msg) => Msg): void {
    setMessages((prev) => prev.map((m, i) => (i === idx ? updater(m) : m)));
  }

  // ── Agent loop ─────────────────────────────────────────────────────────────

  async function runAgentLoop(userMessage: string): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tab?.id;
    if (tabId === undefined) throw new Error('No active tab found.');

    const openAITools = toOpenAITools(tools());
    const history: ChatMessage[] = [
      { role: 'system', content: getSystemInstruction() },
      { role: 'user', content: userMessage },
    ];

    while (true) {
      // show loading dots
      const loadingIdx = appendMsg({ role: 'ai', text: '' });

      const response = await createChatCompletion(history, openAITools);

      // remove loading placeholder
      setMessages((prev) => prev.filter((_, i) => i !== loadingIdx));

      const assistantMessage = response.choices[0]?.message;
      if (!assistantMessage) {
        appendMsg({ role: 'ai', text: 'No response from AI.' });
        return;
      }

      const functionCalls = assistantMessage.tool_calls ?? [];
      history.push({
        role: 'assistant',
        content: assistantMessage.content ?? '',
        tool_calls: functionCalls,
      });

      if (functionCalls.length === 0) {
        if (assistantMessage.content) {
          appendMsg({ role: 'ai', text: assistantMessage.content.trim() });
        }
        return;
      }

      for (const call of functionCalls) {
        const name = call.function.name;
        const rawArgs = call.function.arguments ?? '{}';
        if (!name) continue;

        const inputArgs = normalizeInputArgs(rawArgs);
        const idx = appendMsg({ role: 'tool-call', name, args: inputArgs, result: null });

        try {
          const result = (await chrome.tabs.sendMessage(tabId, {
            action: 'EXECUTE_TOOL',
            name,
            inputArgs,
          })) as string | null;
          updateMsg(idx, () => ({
            role: 'tool-call',
            name,
            args: inputArgs,
            result: result ?? '(no result)',
          }));
          history.push({
            role: 'tool',
            tool_call_id: call.id,
            content: stringifyContent({ result }),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          updateMsg(idx, () => ({
            role: 'tool-call',
            name,
            args: inputArgs,
            result: `Error: ${msg}`,
          }));
          history.push({
            role: 'tool',
            tool_call_id: call.id,
            content: stringifyContent({ error: msg }),
          });
        }
      }
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function submit(): Promise<void> {
    const text = inputValue().trim();
    if (!text || loading()) return;

    setInputValue('');
    appendMsg({ role: 'user', text });
    setLoading(true);

    try {
      await runAgentLoop(text);
    } catch (err) {
      appendMsg({
        role: 'ai',
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  function onChipClick(tool: McpTool): void {
    setInputValue(tool.description ? `Use ${tool.name}: ${tool.description}` : tool.name);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div id="chat-root">
      <div id="messages">
        <For each={messages()}>
          {(msg) => <MessageItem msg={msg} />}
        </For>
        <Show when={loading()}>
          <div class="msg ai loading">
            <span /><span /><span />
          </div>
        </Show>
      </div>
      <div id="bottom">
        <div id="chips">
          <For each={tools()}>
            {(tool) => (
              <button type="button" class="chip" title={tool.description} onClick={() => onChipClick(tool)}>
                {tool.name}
              </button>
            )}
          </For>
        </div>
        <form id="input-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <textarea
            id="prompt-input"
            placeholder="Ask anything…"
            rows={1}
            disabled={loading()}
            value={inputValue()}
            onInput={(e) => setInputValue(e.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
          <button type="submit" id="send-btn" aria-label="Send" disabled={loading()}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
              <path
                d="M10 3a.75.75 0 0 1 .75.75v10.19l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3.75A.75.75 0 0 1 10 3Z"
                transform="rotate(180,10,10)"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

// ── MessageItem component ─────────────────────────────────────────────────────

function MessageItem(props: { msg: Msg }) {
  if (props.msg.role === 'user') {
    return <div class="msg user">{props.msg.text}</div>;
  }
  if (props.msg.role === 'ai') {
    return <div class="msg ai">{props.msg.text}</div>;
  }
  // tool-call
  return <ToolCallItem msg={props.msg} />;
}

function ToolCallItem(props: { msg: ToolCallMsg }) {
  const [expanded, setExpanded] = createSignal(false);
  const ready = () => props.msg.result !== null;

  return (
    <div class="msg tool-call" classList={{ expanded: expanded() }}>
      <div
        class="tool-call-header"
        classList={{ clickable: ready() }}
        onClick={() => { if (ready()) setExpanded((v) => !v); }}
      >
        <span class="tool-call-chevron">›</span>
        <span class="tool-call-name">{props.msg.name}</span>
      </div>
      <Show when={expanded() && ready()}>
        <div class="tool-call-details" style="display:block">
          <DetailSection label="Input" data={tryParseJson(props.msg.args)} />
          <DetailSection label="Output" data={tryParseJson(props.msg.result ?? '')} />
        </div>
      </Show>
    </div>
  );
}

function DetailSection(props: { label: string; data: unknown }) {
  return (
    <div class="tool-detail-section">
      <div class="tool-detail-label">{props.label}</div>
      <div class="tool-detail-body">
        <DataView data={props.data} />
      </div>
    </div>
  );
}

function DataView(props: { data: unknown }) {
  const d = props.data;
  if (d === null || d === undefined) return <span class="tool-detail-empty">null</span>;
  if (typeof d === 'object') {
    const entries = Array.isArray(d)
      ? (d as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
      : Object.entries(d as Record<string, unknown>);
    if (entries.length === 0) return <span class="tool-detail-empty">(empty)</span>;
    return (
      <div class="tool-detail-list">
        <For each={entries}>
          {([k, v]) => (
            <div class="tool-detail-row">
              <span class="tool-detail-key">{k}</span>
              <span class="tool-detail-val">
                <Show when={typeof v === 'object' && v !== null} fallback={<>{JSON.stringify(v)}</>}>
                  <DataView data={v} />
                </Show>
              </span>
            </div>
          )}
        </For>
      </div>
    );
  }
  return <pre>{String(d)}</pre>;
}

function tryParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

// ── Mount ─────────────────────────────────────────────────────────────────────

render(() => <App />, document.getElementById('app')!);
