/**
 * Expandable tool call row showing name, input args, and result.
 */

import { Show } from 'solid-js';
import type { ToolCallMsg } from '../types.js';
import { DetailSection } from './DetailSection.js';
import './ToolCallItem.css';
import { Disclosure } from '../../shared/components/Disclosure.js';

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export function ToolCallItem(props: { msg: ToolCallMsg }) {
  const ready = () => props.msg.result !== null;

  return (
    <Disclosure
      disabled={!ready()}
      class="msg msg--tool-call"
      summary={props.msg.name}
    >
      <Show when={ready()}>
        <DetailSection label="Input" data={tryParseJson(props.msg.args)} />
        <DetailSection
          label="Output"
          data={tryParseJson(props.msg.result ?? '')}
        />
      </Show>
    </Disclosure>
  );
}
