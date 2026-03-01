import type { JSX } from 'solid-js';
import './FormField.css';

export function FormField(props: {
  label: string;
  for: string;
  children: JSX.Element;
}) {
  return (
    <div class="form-group">
      <label for={props.for}>{props.label}</label>
      {props.children}
    </div>
  );
}
