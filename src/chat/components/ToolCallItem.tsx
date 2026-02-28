/**
 * Expandable tool call row showing name, input args, and result.
 */

import { createSignal, Show } from 'solid-js';
import type { ToolCallMsg } from '../types.js';
import { DataView } from './DataView.js';

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function DetailSection(props: { label: string; data: unknown }) {
  return (
    <div class="tool-detail-section">
      <div class="tool-detail-label">{props.label}</div>
      <div class="tool-detail-body">
        <DataView data={props.data} />
      </div>
    </div>
  );
}

export function ToolCallItem(props: { msg: ToolCallMsg }) {
  const [expanded, setExpanded] = createSignal(false);
  const ready = () => props.msg.result !== null;

  return (
    <div class="msg tool-call" classList={{ expanded: expanded() }}>
      <div
        class="tool-call-header"
        classList={{ clickable: ready() }}
        onClick={() => {
          if (ready()) setExpanded((v) => !v);
        }}
      >
        <span class="tool-call-chevron">›</span>
        <span class="tool-call-name">{props.msg.name}</span>
      </div>
      <Show when={expanded() && ready()}>
        <div class="tool-call-details" style="display:block">
          <DetailSection label="Input" data={tryParseJson(props.msg.args)} />
          <DetailSection label="Output" data={tryParseJson(props.msg.result ?? '')} />
        </div>
      </Show>
    </div>
  );
}
