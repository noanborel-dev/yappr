interface Props {
  show: boolean;
  label: string;
  labelTone?: "default" | "polished";
  text: string;
}

// Bubble showing either "here's what you said" (raw) or the polished line.
// Renders the full string at once — no fake word-by-word streaming.
export function Caption({ show, label, labelTone = "default", text }: Props) {
  return (
    <div className={`caption ${show ? "show" : ""}`}>
      <span
        className={`caption-label ${labelTone === "polished" ? "polished" : ""}`}
      >
        {label}
      </span>
      <div className={labelTone === "polished" ? "polished" : "raw"}>
        {text}
      </div>
    </div>
  );
}
