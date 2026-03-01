import './Chip.css';

export function Chip(props: {
  label: string;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      class="chip"
      title={props.title}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}
