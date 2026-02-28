/**
 * Bottom bar containing tool chips and the chat input.
 */

import type { Accessor } from 'solid-js';
import type { McpTool } from '../../types.js';
import { ChatInput } from './ChatInput.js';
import { ToolChips } from './ToolChips.js';
import './ChatFooter.css';

export function ChatFooter(props: {
  tools: Accessor<McpTool[]>;
  inputValue: Accessor<string>;
  disabled: Accessor<boolean>;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onChipClick: (tool: McpTool) => void;
}) {
  return (
    <div id="bottom">
      <ToolChips tools={props.tools} onChipClick={props.onChipClick} />
      <ChatInput
        value={props.inputValue}
        disabled={props.disabled}
        onInput={props.onInput}
        onSubmit={props.onSubmit}
      />
    </div>
  );
}
