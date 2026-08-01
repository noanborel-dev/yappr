interface PillLogoProps {
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: { font: "13px", padding: "6px 12px 6px 10px", dot: "5px", gap: "7px" },
  md: { font: "18px", padding: "8px 16px 8px 14px", dot: "6px", gap: "10px" },
  lg: { font: "30px", padding: "14px 26px 14px 22px", dot: "10px", gap: "14px" },
};

export function PillLogo({ size = "md" }: PillLogoProps) {
  const s = SIZES[size];
  return (
    <span
      className="inline-flex items-center select-none"
      style={{
        background: "#1a1c22",
        borderRadius: 999,
        padding: s.padding,
        gap: s.gap,
        boxShadow:
          "0 1px 0 rgba(255,255,255,.06) inset, 0 6px 18px rgba(0,0,0,.18)",
        color: "#f6f2e7",
        fontFamily: "var(--font-serif)",
        fontStyle: "italic",
        fontSize: s.font,
        lineHeight: 1,
        letterSpacing: "-.005em",
      }}
      aria-label="Yappr"
    >
      <span
        className="pill-dot"
        style={{ width: s.dot, height: s.dot }}
        aria-hidden="true"
      />
      Yappr
    </span>
  );
}
