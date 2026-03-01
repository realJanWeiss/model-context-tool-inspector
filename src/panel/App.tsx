/**
 * Root panel component. Owns all state, agent loop, and tool execution.
 */

import { createSignal } from 'solid-js';
import {
  createChatCompletion,
  generateTemplateFromSchema,
  getFormattedDate,
  getSystemInstruction,
  initLMStudio,
  normalizeInputArgs,
  stringifyContent,
  toOpenAITools,
} from '../lmstudio.js';
import type { ChatMessage, McpTool, ToolsPayload } from '../types.js';
import { CollapsibleSection } from './components/CollapsibleSection.js';
import { ExecuteSection } from './components/ExecuteSection.js';
import { PromptSection } from './components/PromptSection.js';
import { ToolsTable } from './components/ToolsTable.js';

export function App(props: { tabId: number }) {
  const tabId = props.tabId;

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

  // ── Init ──────────────────────────────────────────────────────────────────

  void initLMStudio().then(() => setLmReady(true));

  // ── Tool list updates ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener(
    async (payload: ToolsPayload, sender) => {
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
    },
  );

  // ── Copy helpers ──────────────────────────────────────────────────────────

  async function copyAsScriptToolConfig(): Promise<void> {
    const text = tools()
      .map(
        (t) =>
          `script_tools {\n  name: "${t.name}"\n  description: "${t.description}"\n  input_schema: ${JSON.stringify(t.inputSchema ?? { type: 'object', properties: {} })}\n}`,
      )
      .join('\r\n');
    await navigator.clipboard.writeText(text);
  }

  async function copyAsJSON(): Promise<void> {
    const list = tools().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
        ? (JSON.parse(t.inputSchema) as object)
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
    setTrace((prev) => [
      ...prev,
      { userPrompt: { message, tools: openAITools } },
    ]);

    let finalResponseGiven = false;
    while (!finalResponseGiven) {
      const response = await createChatCompletion(messages, openAITools);
      setTrace((prev) => [...prev, { response }]);
      const assistantMessage = response.choices[0]?.message;
      if (!assistantMessage) {
        logPrompt(
          `⚠️ AI response is missing a message: ${JSON.stringify(response)}`,
        );
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
        for (const fc of functionCalls) {
          const name = fc.function.name;
          const rawArgs = fc.function.arguments ?? '{}';
          if (!name) {
            logPrompt(`⚠️ Malformed tool call from AI: ${JSON.stringify(fc)}`);
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
              tool_call_id: fc.id,
              content: stringifyContent({ result }),
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logPrompt(`⚠️ Error executing tool "${name}": ${msg}`);
            messages.push({
              role: 'tool',
              tool_call_id: fc.id,
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
    if (id !== userPromptPendingId() || userPrompt() !== lastSuggestedPrompt())
      return;
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
    const schema = tool.inputSchema
      ? (JSON.parse(tool.inputSchema) as object)
      : {};
    setInputArgs(JSON.stringify(generateTemplateFromSchema(schema), null, ' '));
  }

  function onToolSelect(name: string): void {
    setSelectedToolName(name);
    updateDefaultInputArgs(tools().find((t) => t.name === name));
  }

  async function executeTool(): Promise<void> {
    setExecuting(true);
    setToolResult('');
    try {
      const result = await chrome.tabs.sendMessage(tabId, {
        action: 'EXECUTE_TOOL',
        name: selectedToolName(),
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div class="container">
      <CollapsibleSection title="WebMCP Tools">
        <ToolsTable
          tools={tools}
          statusMsg={statusMsg}
          toolsUrl={toolsUrl}
          onCopyAsScriptToolConfig={() => void copyAsScriptToolConfig()}
          onCopyAsJSON={() => void copyAsJSON()}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Interact with the Page">
        <PromptSection
          userPrompt={userPrompt}
          promptLog={promptLog}
          lmReady={lmReady}
          onPromptInput={setUserPrompt}
          onSubmit={() => void handlePromptSubmit()}
          onReset={resetPrompt}
          onCopyTrace={() => void copyTrace()}
        />
        <ExecuteSection
          tools={tools}
          selectedToolName={selectedToolName}
          inputArgs={inputArgs}
          toolResult={toolResult}
          executing={executing}
          onToolSelect={onToolSelect}
          onInputArgsChange={setInputArgs}
          onExecute={() => void executeTool()}
        />
      </CollapsibleSection>
    </div>
  );
}

function waitForPageLoad(id: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (
      updatedTabId: number,
      changeInfo: { status?: string },
    ) => {
      if (updatedTabId === id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
