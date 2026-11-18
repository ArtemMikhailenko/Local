import { useId } from "react";
import clsx from "clsx";

export type MascotMood = "idle" | "thinking" | "happy";

/**
 * Lumi, the concierge: a chubby bellhop bean with a pillbox cap and a gold bow tie.
 *  idle      bobs, blinks, little feet shuffle, cap tips now and then
 *  thinking  a magnifying glass floats around the face; pupils follow it
 *  happy     squashes and jumps, eyes turn into ^ ^, confetti pops
 * Pure SVG + CSS (globals.css): crisp at any size, no network requests.
 */
export function Mascot({ mood = "idle", className = "h-10 w-10" }: { mood?: MascotMood; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 96 96" className={clsx("mascot", `mascot-${mood}`, className)} role="img" aria-label="Lumi, your concierge">
      <defs>
        <radialGradient id={`b${id}`} cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FF8A6E" />
          <stop offset="0.55" stopColor="#F2543D" />
          <stop offset="1" stopColor="#D23F2B" />
        </radialGradient>
        <linearGradient id={`c${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2B2A28" />
          <stop offset="1" stopColor="#141312" />
        </linearGradient>
      </defs>

      <ellipse className="mascot-shadow" cx="48" cy="90" rx="20" ry="3.2" fill="#1C1B1A" opacity="0.13" />

      <g className="mascot-body">
        {/* feet */}
        <ellipse className="foot foot-l" cx="38" cy="86" rx="7" ry="4" fill="#1C1B1A" />
        <ellipse className="foot foot-r" cx="58" cy="86" rx="7" ry="4" fill="#1C1B1A" />

        {/* body: a soft bean */}
        <path d="M48 24c18 0 30 13 30 31 0 17-12 30-30 30S18 72 18 55c0-18 12-31 30-31Z" fill={`url(#b${id})`} />
        <ellipse cx="37" cy="38" rx="9" ry="5.5" fill="#fff" opacity="0.28" transform="rotate(-20 37 38)" />

        {/* uniform: little buttons */}
        <circle cx="48" cy="73" r="1.8" fill="#FFD23F" />
        <circle cx="48" cy="79" r="1.8" fill="#FFD23F" />

        {/* bow tie */}
        <g transform="translate(48 66)">
          <path d="M0 0 C-4 -5 -11 -6 -11 0 C-11 6 -4 5 0 0 Z M0 0 C4 -5 11 -6 11 0 C11 6 4 5 0 0 Z" fill="#FFD23F" stroke="#C99A12" strokeWidth="1" />
          <circle r="2.6" fill="#E9B91C" />
        </g>

        {/* cheeks */}
        <ellipse cx="29" cy="58" rx="4.5" ry="3" fill="#FF9F8C" opacity="0.9" />
        <ellipse cx="67" cy="58" rx="4.5" ry="3" fill="#FF9F8C" opacity="0.9" />

        {/* eyes: open (idle/thinking) */}
        <g className="eyes-open">
          <ellipse cx="38" cy="50" rx="7" ry="8" fill="#fff" />
          <ellipse cx="58" cy="50" rx="7" ry="8" fill="#fff" />
          <g className="pupils">
            <g className="mascot-blink">
              <circle cx="39" cy="51" r="4.3" fill="#1C1B1A" />
              <circle cx="59" cy="51" r="4.3" fill="#1C1B1A" />
              <circle cx="40.6" cy="49" r="1.6" fill="#fff" />
              <circle cx="60.6" cy="49" r="1.6" fill="#fff" />
            </g>
          </g>
        </g>
        {/* eyes: happy ^ ^ */}
        <g className="eyes-happy" stroke="#1C1B1A" strokeWidth="3.2" strokeLinecap="round" fill="none">
          <path d="M32 52 Q38 44 44 52" />
          <path d="M52 52 Q58 44 64 52" />
        </g>

        {/* brows */}
        <g className="brows" stroke="#1C1B1A" strokeWidth="2.6" strokeLinecap="round">
          <path d="M32 39.5 Q37 37 42 39" />
          <path d="M54 39 Q59 37 64 39.5" />
        </g>

        {/* mouth */}
        {mood === "happy" ? (
          <g>
            <path d="M40 60 Q48 71 56 60 Z" fill="#1C1B1A" />
            <path d="M44 64.5 Q48 67 52 64.5 Q48 69 44 64.5Z" fill="#FF7A6B" />
          </g>
        ) : mood === "thinking" ? (
          <path d="M44 62 Q48 60 52 62.5" stroke="#1C1B1A" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M42 60.5 Q48 66 54 60.5" stroke="#1C1B1A" strokeWidth="3" strokeLinecap="round" fill="none" />
        )}

        {/* pillbox cap */}
        <g className="mascot-cap">
          <path d="M33 22 h30 a3 3 0 0 1 3 3 v6 h-36 v-6 a3 3 0 0 1 3 -3 Z" fill={`url(#c${id})`} />
          <rect x="30" y="26.5" width="36" height="3" fill="#FFD23F" />
          <path d="M27 31 h42 a3 3 0 0 1 0 6 h-42 a3 3 0 0 1 0 -6 Z" fill="#1C1B1A" />
          <circle cx="48" cy="20" r="3" fill="#FFD23F" stroke="#C99A12" strokeWidth="1" />
        </g>
      </g>

      {/* floating magnifier (thinking) */}
      <g className="magnifier">
        <circle cx="80" cy="40" r="9" fill="#EAF6FF" fillOpacity="0.9" stroke="#1C1B1A" strokeWidth="3.2" />
        <path d="M74 47 L68 54" stroke="#1C1B1A" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M75.5 36 Q78 33.5 81.5 34" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </g>

      {/* confetti (happy) */}
      <g className="sparkles">
        <path className="spark s1" d="M12 18l1.6 4 4 1.6-4 1.6L12 29l-1.6-3.8-4-1.6 4-1.6z" fill="#FFD23F" />
        <path className="spark s2" d="M84 12l1.2 3 3 1.2-3 1.2L84 20.4l-1.2-3-3-1.2 3-1.2z" fill="#FFD23F" />
        <rect className="spark s3" x="80" y="30" width="5" height="3" rx="1" fill="#F2543D" />
        <circle className="spark s4" cx="9" cy="40" r="2.2" fill="#6CC5FF" />
        <rect className="spark s5" x="16" y="8" width="4" height="4" rx="1" fill="#7BD88F" />
      </g>
    </svg>
  );
}
