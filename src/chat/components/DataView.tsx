/**
 * Recursive key/value data renderer.
 */

import { For, Show } from 'solid-js';

export function DataView(props: { data: unknown }) {
  const d = props.data;

  if (d === null || d === undefined) {
    return <span class="tool-detail-empty">null</span>;
  }

  if (typeof d === 'object') {
    const entries = Array.isArray(d)
      ? (d as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
      : Object.entries(d as Record<string, unknown>);

    if (entries.length === 0) {
      return <span class="tool-detail-empty">(empty)</span>;
    }

    return (
      <div class="tool-detail-list">
        <For each={entries}>
          {([k, v]) => (
            <div class="tool-detail-row">
              <span class="tool-detail-key">{k}</span>
              <span class="tool-detail-val">
                <Show
                  when={typeof v === 'object' && v !== null}
                  fallback={<>{JSON.stringify(v)}</>}
                >
                  <DataView data={v} />
                </Show>
              </span>
            </div>
          )}
        </For>
      </div>
    );
  }

  return <pre>{String(d)}</pre>;
}
