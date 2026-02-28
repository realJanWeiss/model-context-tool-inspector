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

// In a DevTools panel the inspected tab ID is always available synchronously.
const tabId = chrome.devtools.inspectedWindow.tabId;

const statusDiv = document.getElementById('status') as HTMLDivElement;
const tbody = document.getElementById('tableBody') as HTMLTableSectionElement;
const thead = document.getElementById('tableHeaderRow') as HTMLTableRowElement;
const copyToClipboard = document.getElementById('copyToClipboard') as HTMLDivElement;
const copyAsScriptToolConfig = document.getElementById('copyAsScriptToolConfig') as HTMLSpanElement;
const copyAsJSON = document.getElementById('copyAsJSON') as HTMLSpanElement;
const toolNamesSelect = document.getElementById('toolNames') as HTMLSelectElement;
const inputArgsText = document.getElementById('inputArgsText') as HTMLTextAreaElement;
const executeBtn = document.getElementById('executeBtn') as HTMLButtonElement;
const toolResults = document.getElementById('toolResults') as HTMLPreElement;
const userPromptText = document.getElementById('userPromptText') as HTMLTextAreaElement;
const promptBtn = document.getElementById('promptBtn') as HTMLButtonElement;
const traceBtn = document.getElementById('traceBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const promptResults = document.getElementById('promptResults') as HTMLPreElement;

// ── Bootstrap ────────────────────────────────────────────────────────────────

initLMStudio().then(() => {
  promptBtn.disabled = false;
  resetBtn.disabled = false;
});

(async () => {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'LIST_TOOLS' });
  } catch (error) {
    statusDiv.textContent = String(error);
    statusDiv.hidden = false;
    copyToClipboard.hidden = true;
  }
})();

// ── State ────────────────────────────────────────────────────────────────────

let currentTools: McpTool[] = [];
let userPromptPendingId = 0;
let lastSuggestedUserPrompt = '';
let trace: unknown[] = [];

// ── Tool list updates ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(async (payload: ToolsPayload, sender) => {
  if (sender.tab && sender.tab.id !== tabId) return;

  tbody.innerHTML = '';
  thead.innerHTML = '';
  toolNamesSelect.innerHTML = '';

  const { message, tools, url } = payload;

  statusDiv.textContent = message ?? '';
  statusDiv.hidden = !message;

  const haveNewTools = JSON.stringify(currentTools) !== JSON.stringify(tools);
  currentTools = tools ?? [];

  if (!tools || tools.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="100%"><i>No tools registered yet in ${url ?? ''}</i></td>`;
    tbody.appendChild(row);
    inputArgsText.value = '';
    inputArgsText.disabled = true;
    toolNamesSelect.disabled = true;
    executeBtn.disabled = true;
    copyToClipboard.hidden = true;
    return;
  }

  inputArgsText.disabled = false;
  toolNamesSelect.disabled = false;
  executeBtn.disabled = false;
  copyToClipboard.hidden = false;

  const firstTool = tools[0];
  if (!firstTool) return;
  const keys = Object.keys(firstTool) as Array<keyof McpTool>;
  keys.forEach((key) => {
    const th = document.createElement('th');
    th.textContent = key;
    thead.appendChild(th);
  });

  tools.forEach((item) => {
    const row = document.createElement('tr');
    keys.forEach((key) => {
      const td = document.createElement('td');
      const val = item[key];
      try {
        td.innerHTML = `<pre>${JSON.stringify(JSON.parse(val as string), null, '  ')}</pre>`;
      } catch {
        td.textContent = val ?? '';
      }
      row.appendChild(td);
    });
    tbody.appendChild(row);

    const option = document.createElement('option');
    option.textContent = `"${item.name}"`;
    option.value = item.name;
    option.dataset['inputSchema'] = item.inputSchema;
    toolNamesSelect.appendChild(option);
  });
  updateDefaultValueForInputArgs();

  if (haveNewTools) void suggestUserPrompt();
});

tbody.ondblclick = () => {
  tbody.classList.toggle('prettify');
};

// ── Copy buttons ─────────────────────────────────────────────────────────────

copyAsScriptToolConfig.onclick = async () => {
  const text = currentTools
    .map(
      (tool) =>
        `script_tools {\n  name: "${tool.name}"\n  description: "${tool.description}"\n  input_schema: ${JSON.stringify(tool.inputSchema ?? { type: 'object', properties: {} })}\n}`,
    )
    .join('\r\n');
  await navigator.clipboard.writeText(text);
};

copyAsJSON.onclick = async () => {
  const tools = currentTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
      ? (JSON.parse(tool.inputSchema) as object)
      : { type: 'object', properties: {} },
  }));
  await navigator.clipboard.writeText(JSON.stringify(tools, null, '  '));
};

// ── Prompt / AI agent loop ────────────────────────────────────────────────────

userPromptText.onkeydown = (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    promptBtn.click();
  }
};

promptBtn.onclick = async () => {
  try {
    await promptAI();
  } catch (error) {
    trace.push({ error });
    logPrompt(`⚠️ Error: "${String(error)}"`);
  }
};

async function promptAI(): Promise<void> {
  const message = userPromptText.value.trim();
  if (!message) return;

  userPromptText.value = '';
  lastSuggestedUserPrompt = '';
  promptResults.textContent += `User prompt: "${message}"\n`;

  const messages: ChatMessage[] = [
    { role: 'system', content: getSystemInstruction() },
    { role: 'user', content: message },
  ];
  const openAITools = toOpenAITools(currentTools);
  trace.push({ userPrompt: { message, tools: openAITools } });

  let finalResponseGiven = false;
  while (!finalResponseGiven) {
    const response = await createChatCompletion(messages, openAITools);
    trace.push({ response });
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
        logPrompt(`⚠️ AI response has no text: ${JSON.stringify(response)}\n`);
      } else {
        logPrompt(`AI result: ${assistantMessage.content.trim()}\n`);
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
        const inputArgs = normalizeInputArgs(rawArgs);
        logPrompt(`AI calling tool "${name}" with ${inputArgs}`);
        try {
          const result = await chrome.tabs.sendMessage(tabId, {
            action: 'EXECUTE_TOOL',
            name,
            inputArgs,
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

resetBtn.onclick = () => {
  trace = [];
  userPromptText.value = '';
  lastSuggestedUserPrompt = '';
  promptResults.textContent = '';
  void suggestUserPrompt();
};

traceBtn.onclick = async () => {
  await navigator.clipboard.writeText(JSON.stringify(trace, null, ' '));
};

async function suggestUserPrompt(): Promise<void> {
  if (currentTools.length === 0 || userPromptText.value !== lastSuggestedUserPrompt) return;
  const userPromptId = ++userPromptPendingId;
  const response = await createChatCompletion([
    {
      role: 'system',
      content: [
        `Today's date is: ${getFormattedDate()}`,
        'Generate one natural user query for the available tools.',
        'Keep it concise and output query text only.',
      ].join('\n'),
    },
    { role: 'user', content: `Available tools:\n${JSON.stringify(currentTools)}` },
  ]);
  if (userPromptId !== userPromptPendingId || userPromptText.value !== lastSuggestedUserPrompt)
    return;
  const suggestion = response.choices[0]?.message.content?.trim();
  if (!suggestion) return;

  lastSuggestedUserPrompt = suggestion;
  userPromptText.value = '';
  for (const chunk of suggestion) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    userPromptText.value += chunk;
  }
}

// ── Manual tool execution ─────────────────────────────────────────────────────

executeBtn.onclick = async () => {
  toolResults.textContent = '';
  const name = toolNamesSelect.selectedOptions[0]?.value ?? '';
  const inputArgs = inputArgsText.value;
  const result = await chrome.tabs.sendMessage(tabId, { action: 'EXECUTE_TOOL', name, inputArgs });
  if (result !== null) {
    toolResults.textContent = String(result);
    return;
  }
  await waitForPageLoad(tabId);
  toolResults.textContent = String(
    await chrome.tabs.sendMessage(tabId, { action: 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT' }),
  );
};

toolNamesSelect.onchange = updateDefaultValueForInputArgs;

function updateDefaultValueForInputArgs(): void {
  const inputSchema = toolNamesSelect.selectedOptions[0]?.dataset['inputSchema'] ?? '{}';
  const template = generateTemplateFromSchema(JSON.parse(inputSchema));
  inputArgsText.value = JSON.stringify(template, null, ' ');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function logPrompt(text: string): void {
  promptResults.textContent += `${text}\n`;
  promptResults.scrollTop = promptResults.scrollHeight;
}

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

document.querySelectorAll('.collapsible-header').forEach((header) => {
  header.addEventListener('click', () => {
    header.classList.toggle('collapsed');
    const content = header.nextElementSibling;
    if (content?.classList.contains('section-content')) {
      content.classList.toggle('is-hidden');
    }
  });
});
