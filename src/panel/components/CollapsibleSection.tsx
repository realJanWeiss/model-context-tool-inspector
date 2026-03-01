/**
 * Reusable collapsible section with a clickable header.
 */

import { createSignal, type JSX } from 'solid-js';

export function CollapsibleSection(props: {
  title: string;
  children: JSX.Element;
}) {
  const [collapsed, setCollapsed] = createSignal(false);

  return (
    <>
      <h2
        class="collapsible-header"
        classList={{ collapsed: collapsed() }}
        onClick={() => setCollapsed((v) => !v)}
      >
        {props.title}
      </h2>
      <div class="section-content" classList={{ 'is-hidden': collapsed() }}>
        {props.children}
      </div>
    </>
  );
}
