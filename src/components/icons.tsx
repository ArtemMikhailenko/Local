type P = { className?: string; filled?: boolean };
const base = "h-5 w-5";

export const IconCompass = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" strokeLinejoin="round" /></svg>
);
export const IconSearch = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" /></svg>
);
export const IconHeart = ({ className = base, filled }: P) => (
  <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className={className}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" strokeLinejoin="round" /></svg>
);
export const IconStar = ({ className = "h-3.5 w-3.5" }: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" /></svg>
);
export const IconBack = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const IconPin = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="M12 21s-6-5.4-6-11a6 6 0 1 1 12 0c0 5.6-6 11-6 11Z" /><circle cx="12" cy="10" r="2.2" /></svg>
);
export const IconWalk = ({ className = "h-3.5 w-3.5" }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><circle cx="13" cy="4.5" r="1.8" /><path d="m9 21 2-6 3 2v4M7 12l2-4 4-1 3 4 3 1M11 15l-1-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const IconSend = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const IconSparkle = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M12 2c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7Zm7 12c.2 2.2 1.1 3.1 3.3 3.3-2.2.2-3.1 1.1-3.3 3.3-.2-2.2-1.1-3.1-3.3-3.3 2.2-.2 3.1-1.1 3.3-3.3Z" /></svg>
);
export const IconGlobe = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" /></svg>
);
export const IconPhone = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" strokeLinejoin="round" /></svg>
);
export const IconShare = ({ className = "h-[18px] w-[18px]" }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}><path d="M12 15V3M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" strokeLinecap="round" /></svg>
);
export const IconDice = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="1.2" fill="currentColor" /><circle cx="15" cy="15" r="1.2" fill="currentColor" /><circle cx="15" cy="9" r="1.2" fill="currentColor" /><circle cx="9" cy="15" r="1.2" fill="currentColor" /></svg>
);
export const IconRoute = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7" /></svg>
);
export const IconBookmark = ({ className = "h-[18px] w-[18px]", filled }: P) => (
  <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className={className}><path d="M6 3h12v18l-6-4.5L6 21V3Z" strokeLinejoin="round" /></svg>
);
export const IconArrow = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="square" /></svg>
);
export const IconMic = ({ className = "h-5 w-5" }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" /></svg>
);
