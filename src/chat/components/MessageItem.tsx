/**
 * Dispatches to the correct bubble component based on message role.
 */

import type { Msg, ToolCallMsg } from '../types.js';
import { ToolCallItem } from './ToolCallItem.js';

export function MessageItem(props: { msg: Msg }) {
  if (props.msg.role === 'user') {
    return <div class="msg user">{props.msg.text}</div>;
  }
  if (props.msg.role === 'ai') {
    return <div class="msg ai">{props.msg.text}</div>;
  }
  return <ToolCallItem msg={props.msg as ToolCallMsg} />;
}
