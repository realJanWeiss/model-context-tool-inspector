import { createSignal, createUniqueId, Show, splitProps } from 'solid-js';
import './Disclosure.css';

export function Disclosure(props: {
  summary: any;
  disabled?: boolean;
  class?: string;
  children?: any;
}) {
  const [local, others] = splitProps(props, [
    'summary',
    'disabled',
    'class',
    'children',
  ]);
  const [expanded, setExpanded] = createSignal(false);
  const id = createUniqueId();

  const onToggle = () => {
    if (local.disabled) return;
    setExpanded((v) => !v);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (local.disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setExpanded((v) => !v);
    }
  };

  return (
    <div
      class={`disclosure ${local.class ?? ''}`}
      classList={{
        'disclosure--expanded': expanded(),
        'disclosure--disabled': local.disabled,
      }}
      {...others}
    >
      <button
        type="button"
        class="disclosure__header"
        aria-controls={id}
        aria-expanded={expanded()}
        disabled={local.disabled}
        onClick={onToggle}
        onKeyDown={onKeyDown}
      >
        <span class="disclosure__chevron" aria-hidden="true">
          ›
        </span>
        <span class="disclosure__summary">{local.summary}</span>
      </button>

      <div id={id} class="disclosure__content">
        <Show when={expanded()}>{local.children}</Show>
      </div>
    </div>
  );
}
