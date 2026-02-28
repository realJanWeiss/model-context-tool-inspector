/**
 * Textarea + send button at the bottom of the chat.
 */

import { Accessor } from 'solid-js';

export function ChatInput(props: {
  value: Accessor<string>;
  disabled: Accessor<boolean>;
  onInput: (value: string) => void;
  onSubmit: () => void;
}) {
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      props.onSubmit();
    }
  }

  return (
    <form
      id="input-form"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      <textarea
        id="prompt-input"
        placeholder="Ask anything…"
        rows={1}
        disabled={props.disabled()}
        value={props.value()}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" id="send-btn" aria-label="Send" disabled={props.disabled()}>
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
          <path
            d="M10 3a.75.75 0 0 1 .75.75v10.19l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3.75A.75.75 0 0 1 10 3Z"
            transform="rotate(180,10,10)"
          />
        </svg>
      </button>
    </form>
  );
}
