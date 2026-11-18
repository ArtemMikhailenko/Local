import clsx from "clsx";

export type MascotMood = "idle" | "thinking" | "happy";

/**
 * Lumi, the concierge: a round bellhop with a little cap. Pure SVG + CSS animation
 * (blinks, bobs; looks around while thinking; smiles wide when it found something).
 */
export function Mascot({ mood = "idle", className = "h-10 w-10" }: { mood?: MascotMood; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={clsx("mascot", `mascot-${mood}`, className)} role="img" aria-label="Lumi, your concierge">
      <g className="mascot-body">
        {/* body */}
        <circle cx="32" cy="36" r="22" fill="#F2543D" />
        <ellipse cx="25" cy="27" rx="7" ry="4.5" fill="#fff" opacity="0.18" />
        {/* bellhop cap */}
        <g className="mascot-cap">
          <rect x="20" y="9" width="24" height="9" rx="3" fill="#1C1B1A" />
          <rect x="17" y="16" width="30" height="4" rx="2" fill="#1C1B1A" />
          <rect x="20" y="12" width="24" height="2" fill="#FFD23F" />
          <circle cx="32" cy="8" r="2.5" fill="#FFD23F" />
        </g>
        {/* cheeks */}
        <circle cx="19" cy="41" r="3.2" fill="#FF9A86" />
        <circle cx="45" cy="41" r="3.2" fill="#FF9A86" />
        {/* eyes */}
        <g className="mascot-eyes">
          <g className="mascot-blink">
            <ellipse cx="25" cy="35" rx="3" ry="3.6" fill="#1C1B1A" />
            <ellipse cx="39" cy="35" rx="3" ry="3.6" fill="#1C1B1A" />
            <circle cx="26" cy="33.8" r="1" fill="#fff" />
            <circle cx="40" cy="33.8" r="1" fill="#fff" />
          </g>
        </g>
        {/* mouth */}
        {mood === "happy" ? (
          <path d="M25 43 Q32 51 39 43 Z" fill="#1C1B1A" />
        ) : mood === "thinking" ? (
          <circle cx="32" cy="45" r="2.2" fill="#1C1B1A" />
        ) : (
          <path d="M26.5 44 Q32 48.5 37.5 44" stroke="#1C1B1A" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        )}
      </g>
    </svg>
  );
}
