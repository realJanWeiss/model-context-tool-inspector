/**
 * Shared types used across the extension.
 */

/** A single WebMCP tool as returned by navigator.modelContextTesting.listTools(). */
export interface McpTool {
  name: string;
  description: string;
  /** JSON-encoded input schema string, or undefined. */
  inputSchema?: string;
}

/** Messages sent between extension contexts. */
export type ExtensionMessage =
  | { action: 'LIST_TOOLS' }
  | { action: 'EXECUTE_TOOL'; name: string; inputArgs: string }
  | { action: 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT' };

/** Broadcast payload from content.js to background + panel/sidebar. */
export interface ToolsPayload {
  tools?: McpTool[];
  url?: string;
  message?: string;
}

/** OpenAI-compatible tool definition. */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters?: object;
  };
}

/** OpenAI chat message. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
}
