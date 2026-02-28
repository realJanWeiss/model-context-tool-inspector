import {
  createChatCompletion,
  getSystemInstruction,
  initLMStudio,
  normalizeInputArgs,
  stringifyContent,
  toOpenAITools,
} from './lmstudio.js';
import type { ChatMessage, McpTool, ToolsPayload } from './types.js';

const messagesEl = document.getElementById('messages') as HTMLDivElement;
const chipsEl = document.getElementById('chips') as HTMLDivElement;
const form = document.getElementById('input-form') as HTMLFormElement;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;

// ── State ────────────────────────────────────────────────────────────────────

let currentTools: McpTool[] = [];

// ── Bootstrap ────────────────────────────────────────────────────────────────

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

// ── Tool list updates from content script ─────────────────────────────────────

chrome.runtime.onMessage.addListener(async (payload: ToolsPayload, sender) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (sender.tab && sender.tab.id !== tab?.id) return;
  if (!payload.tools) return;

  currentTools = payload.tools;
  renderChips();
});

function renderChips(): void {
  chipsEl.innerHTML = '';
  currentTools.forEach((tool) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = tool.name;
    chip.title = tool.description ?? '';
    chip.addEventListener('click', () => {
      promptInput.value = tool.description ? `Use ${tool.name}: ${tool.description}` : tool.name;
      promptInput.focus();
      autoResize();
    });
    chipsEl.appendChild(chip);
  });
}

// ── Input handling ────────────────────────────────────────────────────────────

promptInput.addEventListener('input', autoResize);

promptInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    void submitPrompt();
  }
});

form.addEventListener('submit', (e: SubmitEvent) => {
  e.preventDefault();
  void submitPrompt();
});

function autoResize(): void {
  promptInput.style.height = 'auto';
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 160)}px`;
}

async function submitPrompt(): Promise<void> {
  const text = promptInput.value.trim();
  if (!text || sendBtn.disabled) return;

  promptInput.value = '';
  promptInput.style.height = '';
  addUserBubble(text);
  setLoading(true);

  try {
    await runAgentLoop(text);
  } catch (err) {
    addAIMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setLoading(false);
  }
}

// ── Chat rendering ────────────────────────────────────────────────────────────

function addUserBubble(text: string): void {
  const bubble = document.createElement('div');
  bubble.className = 'msg user';
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  scrollToBottom();
}

function addAIMessage(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'msg ai';
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function addToolCall(name: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'msg tool-call';

  const header = document.createElement('div');
  header.className = 'tool-call-header';
  header.innerHTML = `<span class="tool-call-chevron">›</span><span class="tool-call-name">${name}</span>`;
  el.appendChild(header);

  const details = document.createElement('div');
  details.className = 'tool-call-details';
  el.appendChild(details);

  header.addEventListener('click', () => {
    if (details.dataset['ready'] === 'true') {
      el.classList.toggle('expanded');
    }
  });

  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function setToolCallResult(el: HTMLDivElement, args: string, result: string): void {
  const details = el.querySelector('.tool-call-details') as HTMLDivElement;

  let argsObj: unknown;
  try {
    argsObj = JSON.parse(args);
  } catch {
    argsObj = args;
  }

  let resultObj: unknown;
  try {
    resultObj = JSON.parse(result);
  } catch {
    resultObj = result;
  }

  details.appendChild(buildDetailSection('Input', argsObj));
  details.appendChild(buildDetailSection('Output', resultObj));

  details.dataset['ready'] = 'true';
  (el.querySelector('.tool-call-header') as HTMLElement).classList.add('clickable');
}

function buildDetailSection(label: string, data: unknown): HTMLDivElement {
  const section = document.createElement('div');
  section.className = 'tool-detail-section';

  const heading = document.createElement('div');
  heading.className = 'tool-detail-label';
  heading.textContent = label;
  section.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'tool-detail-body';

  if (data === null || data === undefined) {
    body.textContent = 'null';
  } else if (typeof data === 'object') {
    body.appendChild(renderObject(data as Record<string, unknown> | unknown[]));
  } else {
    const pre = document.createElement('pre');
    pre.textContent = String(data);
    body.appendChild(pre);
  }

  section.appendChild(body);
  return section;
}

function renderObject(data: Record<string, unknown> | unknown[]): HTMLElement {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      const em = document.createElement('span');
      em.className = 'tool-detail-empty';
      em.textContent = '(empty)';
      return em;
    }
    const list = document.createElement('div');
    list.className = 'tool-detail-list';
    data.forEach((item, i) => {
      list.appendChild(makeDetailRow(String(i), item));
    });
    return list;
  }

  const entries = Object.entries(data);
  if (entries.length === 0) {
    const em = document.createElement('span');
    em.className = 'tool-detail-empty';
    em.textContent = '(empty)';
    return em;
  }
  const list = document.createElement('div');
  list.className = 'tool-detail-list';
  entries.forEach(([k, v]) => list.appendChild(makeDetailRow(k, v)));
  return list;
}

function makeDetailRow(key: string, value: unknown): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'tool-detail-row';

  const keyEl = document.createElement('span');
  keyEl.className = 'tool-detail-key';
  keyEl.textContent = key;

  const valEl = document.createElement('span');
  valEl.className = 'tool-detail-val';
  if (typeof value === 'object' && value !== null) {
    valEl.appendChild(renderObject(value as Record<string, unknown> | unknown[]));
  } else {
    valEl.textContent = JSON.stringify(value);
  }

  row.appendChild(keyEl);
  row.appendChild(valEl);
  return row;
}

function scrollToBottom(): void {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setLoading(on: boolean): void {
  sendBtn.disabled = on;
  promptInput.disabled = on;
  if (on) {
    const dot = document.createElement('div');
    dot.className = 'msg ai loading';
    dot.id = 'loading-indicator';
    dot.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(dot);
    scrollToBottom();
  } else {
    document.getElementById('loading-indicator')?.remove();
  }
}

// ── Agent loop ────────────────────────────────────────────────────────────────

async function runAgentLoop(userMessage: string): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  if (tabId === undefined) throw new Error('No active tab found.');

  const openAITools = toOpenAITools(currentTools);
  const messages: ChatMessage[] = [
    { role: 'system', content: getSystemInstruction() },
    { role: 'user', content: userMessage },
  ];

  document.getElementById('loading-indicator')?.remove();

  while (true) {
    const loadingDot = document.createElement('div');
    loadingDot.className = 'msg ai loading';
    loadingDot.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(loadingDot);
    scrollToBottom();

    const response = await createChatCompletion(messages, openAITools);
    loadingDot.remove();

    const assistantMessage = response.choices[0]?.message;
    if (!assistantMessage) {
      addAIMessage('No response from AI.');
      return;
    }

    const functionCalls = assistantMessage.tool_calls ?? [];
    messages.push({
      role: 'assistant',
      content: assistantMessage.content ?? '',
      tool_calls: functionCalls,
    });

    if (functionCalls.length === 0) {
      if (assistantMessage.content) {
        addAIMessage(assistantMessage.content.trim());
      }
      return;
    }

    for (const call of functionCalls) {
      const name = call.function.name;
      const rawArgs = call.function.arguments ?? '{}';
      if (!name) continue;

      const inputArgs = normalizeInputArgs(rawArgs);
      const toolCallEl = addToolCall(name);

      try {
        const result = (await chrome.tabs.sendMessage(tabId, {
          action: 'EXECUTE_TOOL',
          name,
          inputArgs,
        })) as string | null;
        setToolCallResult(toolCallEl, inputArgs, result ?? '(no result)');
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: stringifyContent({ result }),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setToolCallResult(toolCallEl, inputArgs, `Error: ${msg}`);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: stringifyContent({ error: msg }),
        });
      }
    }
  }
}
