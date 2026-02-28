/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const LM_STUDIO_BASE_URL = 'http://localhost:1234';
const LM_STUDIO_MODELS_URL = `${LM_STUDIO_BASE_URL}/v1/models`;
const LM_STUDIO_CHAT_COMPLETIONS_URL = `${LM_STUDIO_BASE_URL}/v1/chat/completions`;

const messagesEl = document.getElementById('messages');
const chipsEl = document.getElementById('chips');
const form = document.getElementById('input-form');
const promptInput = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');

// ── State ────────────────────────────────────────────────────────────────────

let currentTools = [];
let selectedModel;

// ── Bootstrap ────────────────────────────────────────────────────────────────

initLMStudio();

(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { action: 'LIST_TOOLS' });
  } catch {
    // content script not ready yet — tools will arrive once page loads
  }
})();

// ── Tool list updates from content.js ────────────────────────────────────────

chrome.runtime.onMessage.addListener(async ({ tools }, sender) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (sender.tab && sender.tab.id !== tab.id) return;
  if (!tools) return;

  currentTools = tools;
  renderChips();
});

function renderChips() {
  chipsEl.innerHTML = '';
  currentTools.forEach((tool) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = tool.name;
    chip.title = tool.description || '';
    chip.addEventListener('click', () => {
      promptInput.value = tool.description
        ? `Use ${tool.name}: ${tool.description}`
        : tool.name;
      promptInput.focus();
      autoResize();
    });
    chipsEl.appendChild(chip);
  });
}

// ── Input handling ────────────────────────────────────────────────────────────

promptInput.addEventListener('input', autoResize);

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submitPrompt();
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  submitPrompt();
});

function autoResize() {
  promptInput.style.height = 'auto';
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 160)}px`;
}

async function submitPrompt() {
  const text = promptInput.value.trim();
  if (!text || sendBtn.disabled) return;

  promptInput.value = '';
  promptInput.style.height = '';
  addUserBubble(text);
  setLoading(true);

  try {
    await runAgentLoop(text);
  } catch (err) {
    addAIMessage(`Error: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

// ── Chat rendering ────────────────────────────────────────────────────────────

function addUserBubble(text) {
  const bubble = document.createElement('div');
  bubble.className = 'msg user';
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  scrollToBottom();
}

function addAIMessage(text) {
  const el = document.createElement('div');
  el.className = 'msg ai';
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function addToolCall(name) {
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
    if (details.dataset.ready === 'true') {
      el.classList.toggle('expanded');
    }
  });

  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function setToolCallResult(el, args, result) {
  const details = el.querySelector('.tool-call-details');

  let argsObj;
  try { argsObj = JSON.parse(args); } catch { argsObj = args; }

  let resultObj;
  try { resultObj = JSON.parse(result); } catch { resultObj = result; }

  const inputSection = buildDetailSection('Input', argsObj);
  const outputSection = buildDetailSection('Output', resultObj);
  details.appendChild(inputSection);
  details.appendChild(outputSection);

  details.dataset.ready = 'true';
  el.querySelector('.tool-call-header').classList.add('clickable');
}

function buildDetailSection(label, data) {
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
    body.appendChild(renderObject(data));
  } else {
    const pre = document.createElement('pre');
    pre.textContent = String(data);
    body.appendChild(pre);
  }

  section.appendChild(body);
  return section;
}

function renderObject(data) {
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
      const row = document.createElement('div');
      row.className = 'tool-detail-row';
      const key = document.createElement('span');
      key.className = 'tool-detail-key';
      key.textContent = `${i}`;
      const val = document.createElement('span');
      val.className = 'tool-detail-val';
      if (typeof item === 'object' && item !== null) {
        val.appendChild(renderObject(item));
      } else {
        val.textContent = JSON.stringify(item);
      }
      row.appendChild(key);
      row.appendChild(val);
      list.appendChild(row);
    });
    return list;
  }

  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data);
    if (entries.length === 0) {
      const em = document.createElement('span');
      em.className = 'tool-detail-empty';
      em.textContent = '(empty)';
      return em;
    }
    const list = document.createElement('div');
    list.className = 'tool-detail-list';
    entries.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'tool-detail-row';
      const key = document.createElement('span');
      key.className = 'tool-detail-key';
      key.textContent = k;
      const val = document.createElement('span');
      val.className = 'tool-detail-val';
      if (typeof v === 'object' && v !== null) {
        val.appendChild(renderObject(v));
      } else {
        val.textContent = JSON.stringify(v);
      }
      row.appendChild(key);
      row.appendChild(val);
      list.appendChild(row);
    });
    return list;
  }

  const span = document.createElement('span');
  span.textContent = JSON.stringify(data);
  return span;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setLoading(on) {
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

// ── LM Studio ────────────────────────────────────────────────────────────────

async function initLMStudio() {
  try {
    const models = await getAvailableModels();
    const storedModel = localStorage.model;
    selectedModel =
      models.length > 0
        ? models.some((m) => m.id === storedModel)
          ? storedModel
          : models[0].id
        : storedModel || 'local-model';
  } catch {
    selectedModel = localStorage.model || 'local-model';
  }
  localStorage.model = selectedModel;
}

async function getAvailableModels() {
  const res = await fetch(LM_STUDIO_MODELS_URL);
  if (!res.ok) throw new Error(`Models fetch failed: ${res.status}`);
  return (await res.json()).data || [];
}

async function createChatCompletion(messages, tools = []) {
  const payload = {
    model: selectedModel || localStorage.model || 'local-model',
    messages,
    temperature: 0.2,
  };
  if (tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }
  const res = await fetch(LM_STUDIO_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LM Studio (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
}

// ── Agent loop ───────────────────────────────────────────────────────────────

async function runAgentLoop(userMessage) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const openAITools = currentTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema ? JSON.parse(t.inputSchema) : { type: 'object', properties: {} },
    },
  }));

  const messages = [
    {
      role: 'system',
      content: [
        'You are an assistant embedded in a browser tab.',
        'User prompts typically refer to the current tab unless stated otherwise.',
        'Use your tools to query page content when you need it.',
        `Today's date is: ${getFormattedDate()}`,
        "CRITICAL RULE: Whenever the user provides a relative date, calculate the exact calendar date based on today's date.",
      ].join('\n'),
    },
    { role: 'user', content: userMessage },
  ];

  // Remove the loading dots while we stream replies in; re-add if still waiting
  document.getElementById('loading-indicator')?.remove();

  while (true) {
    // Show typing indicator before each LLM call
    const loadingDot = document.createElement('div');
    loadingDot.className = 'msg ai loading';
    loadingDot.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(loadingDot);
    scrollToBottom();

    const response = await createChatCompletion(messages, openAITools);
    loadingDot.remove();

    const assistantMessage = response?.choices?.[0]?.message;
    if (!assistantMessage) {
      addAIMessage('No response from AI.');
      return;
    }

    const functionCalls = assistantMessage.tool_calls || [];

    messages.push({
      role: 'assistant',
      content: assistantMessage.content || '',
      tool_calls: functionCalls,
    });

    if (functionCalls.length === 0) {
      if (assistantMessage.content) {
        addAIMessage(assistantMessage.content.trim());
      }
      return;
    }

    for (const call of functionCalls) {
      const name = call?.function?.name;
      const rawArgs = call?.function?.arguments || '{}';
      if (!name) continue;

      const inputArgs = normalizeInputArgs(rawArgs);
      const toolCallEl = addToolCall(name);

      try {
        const result = await chrome.tabs.sendMessage(tab.id, {
          action: 'EXECUTE_TOOL',
          name,
          inputArgs,
        });
        setToolCallResult(toolCallEl, inputArgs, result ?? '(no result)');
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: stringifyContent({ result }),
        });
      } catch (e) {
        setToolCallResult(toolCallEl, inputArgs, `Error: ${e.message}`);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: stringifyContent({ error: e.message }),
        });
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getFormattedDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function normalizeInputArgs(raw) {
  if (!raw) return '{}';
  if (typeof raw === 'string') {
    try { return JSON.stringify(JSON.parse(raw)); } catch { return '{}'; }
  }
  return JSON.stringify(raw);
}

function stringifyContent(v) {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}
