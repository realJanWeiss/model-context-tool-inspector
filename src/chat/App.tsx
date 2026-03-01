/**
 * Root chat component. Owns all state and the agent loop.
 */

import { createSignal } from 'solid-js';
import {
  createChatCompletion,
  getSystemInstruction,
  normalizeInputArgs,
  stringifyContent,
  toOpenAITools,
} from '../lmstudio.js';
import type { ChatMessage, McpTool, ToolsPayload } from '../types.js';
import { ChatFooter } from './components/ChatFooter.js';
import { MessageList } from './components/MessageList.js';
import type { Msg } from './types.js';

export function App() {
  const [tools, setTools] = createSignal<McpTool[]>([]);
  const [messages, setMessages] = createSignal<Msg[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [inputValue, setInputValue] = createSignal('');

  // ── Tool list updates from content script ────────────────────────────────

  chrome.runtime.onMessage.addListener(
    async (payload: ToolsPayload, sender) => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (sender.tab && sender.tab.id !== tab?.id) return;
      if (!payload.tools) return;
      setTools(payload.tools);
    },
  );

  // ── Message helpers ──────────────────────────────────────────────────────

  function appendMsg(msg: Msg): number {
    const idx = messages().length;
    setMessages((prev) => [...prev, msg]);
    return idx;
  }

  function updateMsg(idx: number, updater: (m: Msg) => Msg): void {
    setMessages((prev) => prev.map((m, i) => (i === idx ? updater(m) : m)));
  }

  // ── Agent loop ───────────────────────────────────────────────────────────

  async function runAgentLoop(userMessage: string): Promise<void> {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const tabId = tab?.id;
    if (tabId === undefined) throw new Error('No active tab found.');

    const openAITools = toOpenAITools(tools());
    const history: ChatMessage[] = [
      { role: 'system', content: getSystemInstruction() },
      { role: 'user', content: userMessage },
    ];

    while (true) {
      const loadingIdx = appendMsg({ role: 'ai', text: '' });
      const response = await createChatCompletion(history, openAITools);
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
        const idx = appendMsg({
          role: 'tool-call',
          name,
          args: inputArgs,
          result: null,
        });

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

  // ── Submit ───────────────────────────────────────────────────────────────

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

  function onChipClick(tool: McpTool): void {
    setInputValue(
      tool.description ? `Use ${tool.name}: ${tool.description}` : tool.name,
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div id="chat-root">
      <MessageList messages={messages} loading={loading} />
      <ChatFooter
        tools={tools}
        inputValue={inputValue}
        disabled={loading}
        onInput={setInputValue}
        onSubmit={() => void submit()}
        onChipClick={onChipClick}
      />
    </div>
  );
}
