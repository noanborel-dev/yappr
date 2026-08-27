// The brand mark: the notch shape, with the wordmark in it.
//
// This used to be a fully-rounded charcoal pill. It's now the same silhouette
// as the product — flat near-black, square across the top, rounded only at
// the bottom — because the real indicator hangs from the top edge of your
// screen. The mark and the app are now the same object.
//
// Kept: the red record dot and the italic serif wordmark. Those were always
// right, and they're exactly what the app's own indicator draws.
//
// Filename stays PillLogo to avoid churn across Nav / Footer / FinalCTA —
// the shape changed, not the role.

interface PillLogoProps {
  size?: "sm" | "md" | "lg";
  /**
   * Sit flush against the top of the container so the mark genuinely hangs
   * from the page edge, the way the indicator hangs from the menu bar.
   */
  hanging?: boolean;
  /**
   * "notch" needs a top edge to hang from. Where there isn't one, use
   * "square": detached, the notch silhouette is just a rounded rectangle
   * — which is the pill this whole system replaced. The footer is that
   * case, and so is any avatar or icon slot.
   */
  shape?: "notch" | "square";
}

const SIZES = {
  sm: { font: 13, padH: 12, padTop: 7, padBot: 8, dot: 5, gap: 7, radius: 9, box: 34 },
  md: { font: 18, padH: 16, padTop: 9, padBot: 11, dot: 6, gap: 10, radius: 12, box: 44 },
  lg: { font: 30, padH: 26, padTop: 15, padBot: 18, dot: 10, gap: 14, radius: 18, box: 68 },
};

export function PillLogo({ size = "md", hanging, shape = "notch" }: PillLogoProps) {
  const s = SIZES[size];

  // SQUARE — a rounded square carrying a single letterform.
  //
  // "Yappr" does not fit a square at this scale, and shrinking it to fit
  // is how the favicon became unreadable. One letter at a legible size
  // beats five at an illegible one.
  //
  // Radius is 22% of the side, the macOS squircle proportion, so the
  // footer mark and the Dock icon are recognisably the same object.
  if (shape === "square") {
    return (
      <span
        className="square-logo"
        style={{
          width: s.box,
          height: s.box,
          borderRadius: Math.round(s.box * 0.22),
          fontSize: Math.round(s.box * 0.52),
        }}
        aria-label="Yappr"
        role="img"
      >
        Y
      </span>
    );
  }

  return (
    <span
      className={`notch-logo ${hanging ? "notch-logo--hanging" : ""}`}
      style={{
        padding: `${s.padTop}px ${s.padH}px ${s.padBot}px`,
        gap: s.gap,
        fontSize: s.font,
        // Square on top, rounded at the bottom — the notch silhouette.
        borderRadius: `0 0 ${s.radius}px ${s.radius}px`,
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
