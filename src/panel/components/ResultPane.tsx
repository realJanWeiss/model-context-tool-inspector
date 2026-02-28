/**
 * Scrollable pre-formatted output pane for tool and prompt results.
 */

import type { Accessor } from 'solid-js';
import './ResultPane.css';

export function ResultPane(props: { id: string; content: Accessor<string> }) {
  return <pre id={props.id} class="result-pane">{props.content()}</pre>;
}
