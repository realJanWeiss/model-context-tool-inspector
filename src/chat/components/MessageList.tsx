/**
 * Scrollable message list with loading indicator.
 */

import { type Accessor, For, Show } from 'solid-js';
import type { Msg } from '../types.js';
import { LoadingDots } from './LoadingDots.js';
import { MessageItem } from './MessageItem.js';

export function MessageList(props: {
  messages: Accessor<Msg[]>;
  loading: Accessor<boolean>;
}) {
  return (
    <div id="messages">
      <For each={props.messages()}>{(msg) => <MessageItem msg={msg} />}</For>
      <Show when={props.loading()}>
        <LoadingDots />
      </Show>
    </div>
  );
}
