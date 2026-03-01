/**
 * A labelled section inside an expanded tool call card.
 */

import { DataView } from './DataView';
import './DetailSection.css';

export function DetailSection(props: { label: string; data: unknown }) {
  return (
    <div class="tool-detail-section">
      <div class="tool-detail-label">{props.label}</div>
      <div class="tool-detail-body">
        <DataView data={props.data} />
      </div>
    </div>
  );
}
