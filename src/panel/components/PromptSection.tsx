/**
 * AI prompt section: textarea, send/reset/trace buttons, and log output.
 */

import { Accessor } from 'solid-js';
import { FormField } from './FormField.js';
import { ResultPane } from './ResultPane.js';

export function PromptSection(props: {
  userPrompt: Accessor<string>;
  promptLog: Accessor<string>;
  lmReady: Accessor<boolean>;
  onPromptInput: (value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  onCopyTrace: () => void;
}) {
  return (
    <>
      <FormField label="User Prompt" for="userPromptText">
        <textarea
          id="userPromptText"
          value={props.userPrompt()}
          onInput={(e) => props.onPromptInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              props.onSubmit();
            }
          }}
        />
      </FormField>

      <div class="form-group">
        <button disabled={!props.lmReady()} onClick={props.onSubmit}>Send</button>
        <button class="secondary" disabled={!props.lmReady()} onClick={props.onReset}>Reset</button>
        <button class="secondary" onClick={props.onCopyTrace}>Copy trace</button>
      </div>

      <ResultPane id="promptResults" content={props.promptLog} />
    </>
  );
}
