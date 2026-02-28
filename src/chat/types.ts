/**
 * Message types used in the chat UI.
 */

export interface UserMsg {
  role: 'user';
  text: string;
}

export interface AiMsg {
  role: 'ai';
  text: string;
}

export interface ToolCallMsg {
  role: 'tool-call';
  name: string;
  args: string;
  result: string | null; // null = still pending
}

export type Msg = UserMsg | AiMsg | ToolCallMsg;
