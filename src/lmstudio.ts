/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared LM Studio client and agent-loop utilities.
 */

import type { ChatCompletionResponse, ChatMessage, McpTool, OpenAITool } from './types.js';

const LM_STUDIO_BASE_URL = 'http://localhost:1234';
const LM_STUDIO_MODELS_URL = `${LM_STUDIO_BASE_URL}/v1/models`;
const LM_STUDIO_CHAT_COMPLETIONS_URL = `${LM_STUDIO_BASE_URL}/v1/chat/completions`;

let selectedModel: string | undefined;

export async function initLMStudio(): Promise<void> {
  try {
    const models = await getAvailableModels();
    const storedModel = localStorage.getItem('model') ?? undefined;
    selectedModel =
      models.length > 0
        ? models.some((m) => m.id === storedModel)
          ? storedModel
          : models[0]?.id
        : storedModel ?? 'local-model';
  } catch {
    selectedModel = localStorage.getItem('model') ?? 'local-model';
  }
  localStorage.setItem('model', selectedModel ?? 'local-model');
}

async function getAvailableModels(): Promise<Array<{ id: string }>> {
  const res = await fetch(LM_STUDIO_MODELS_URL);
  if (!res.ok) throw new Error(`Models fetch failed: ${res.status}`);
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  return json.data ?? [];
}

export async function createChatCompletion(
  messages: ChatMessage[],
  tools: OpenAITool[] = [],
): Promise<ChatCompletionResponse> {
  const payload: Record<string, unknown> = {
    model: selectedModel ?? localStorage.getItem('model') ?? 'local-model',
    messages,
    temperature: 0.2,
  };
  if (tools.length > 0) {
    payload['tools'] = tools;
    payload['tool_choice'] = 'auto';
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
  return res.json() as Promise<ChatCompletionResponse>;
}

export function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getSystemInstruction(): string {
  return [
    'You are an assistant embedded in a browser tab.',
    'User prompts typically refer to the current tab unless stated otherwise.',
    'Use your tools to query page content when you need it.',
    `Today's date is: ${getFormattedDate()}`,
    "CRITICAL RULE: Whenever the user provides a relative date (e.g., \"next Monday\", \"tomorrow\", \"in 3 days\"), you must calculate the exact calendar date based on today's date.",
  ].join('\n');
}

export function toOpenAITools(tools: McpTool[]): OpenAITool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema
        ? (JSON.parse(t.inputSchema) as object)
        : { type: 'object', properties: {} },
    },
  }));
}

export function normalizeInputArgs(raw: string | object | undefined): string {
  if (!raw) return '{}';
  if (typeof raw === 'string') {
    try {
      return JSON.stringify(JSON.parse(raw));
    } catch {
      return '{}';
    }
  }
  return JSON.stringify(raw);
}

export function stringifyContent(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function generateTemplateFromSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return null;
  const s = schema as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(s, 'const')) return s['const'];

  if (Array.isArray(s['oneOf']) && s['oneOf'].length > 0) {
    return generateTemplateFromSchema(s['oneOf'][0]);
  }

  if (Object.prototype.hasOwnProperty.call(s, 'default')) return s['default'];

  if (Array.isArray(s['examples']) && s['examples'].length > 0) {
    return s['examples'][0];
  }

  switch (s['type']) {
    case 'object': {
      const obj: Record<string, unknown> = {};
      if (s['properties'] && typeof s['properties'] === 'object') {
        for (const key of Object.keys(s['properties'] as object)) {
          obj[key] = generateTemplateFromSchema(
            (s['properties'] as Record<string, unknown>)[key],
          );
        }
      }
      return obj;
    }
    case 'array':
      if (s['items']) return [generateTemplateFromSchema(s['items'])];
      return [];
    case 'string': {
      if (Array.isArray(s['enum']) && s['enum'].length > 0) return s['enum'][0];
      if (s['format'] === 'date') return new Date().toISOString().substring(0, 10);
      if (
        s['format'] ===
        '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\\.[0-9]{1,3})?)?$'
      )
        return new Date().toISOString().substring(0, 23);
      if (
        s['format'] ===
        '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
      )
        return new Date().toISOString().substring(0, 19);
      if (
        s['format'] ===
        '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]$'
      )
        return new Date().toISOString().substring(0, 16);
      if (s['format'] === '^[0-9]{4}-(0[1-9]|1[0-2])$')
        return new Date().toISOString().substring(0, 7);
      if (s['format'] === '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$')
        return `${new Date().toISOString().substring(0, 4)}-W01`;
      if (
        s['format'] ===
        '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\\.[0-9]{1,3})?)?$'
      )
        return new Date().toISOString().substring(11, 23);
      if (s['format'] === '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$')
        return new Date().toISOString().substring(11, 19);
      if (s['format'] === '^([01][0-9]|2[0-3]):[0-5][0-9]$')
        return new Date().toISOString().substring(11, 16);
      if (s['format'] === '^#[0-9a-zA-Z]{6}$') return '#ff00ff';
      if (s['format'] === 'tel') return '123-456-7890';
      if (s['format'] === 'email') return 'user@example.com';
      return 'example_string';
    }
    case 'number':
    case 'integer':
      if (typeof s['minimum'] === 'number') return s['minimum'];
      return 0;
    case 'boolean':
      return false;
    case 'null':
      return null;
    default:
      return {};
  }
}
