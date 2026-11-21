import React from 'react';

/** Hero artwork: a zigzag timeline of framed memories. Colors follow the active theme. */
export const HeroIllustration: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 460 560" className={className} role="img" aria-label="A winding timeline of framed memories" fill="none">
    <circle cx="90" cy="70" r="60" fill="var(--accent-amber)" opacity="0.25" />
    <circle cx="390" cy="480" r="80" fill="var(--accent-coral)" opacity="0.18" />
    <path d="M230 30 V530" stroke="var(--border-color)" strokeWidth="4" strokeDasharray="4 12" strokeLinecap="round" />

    {/* Frame 1: sunny hills, left */}
    <g transform="rotate(-5 120 120)">
      <rect x="30" y="50" width="170" height="150" rx="18" fill="var(--bg-card)" stroke="var(--text-primary)" strokeWidth="3" />
      <rect x="44" y="64" width="142" height="100" rx="10" fill="var(--accent-cyan)" opacity="0.35" />
      <circle cx="150" cy="92" r="16" fill="var(--accent-amber)" />
      <path d="M44 164 L88 112 L120 146 L148 124 L186 164 Z" fill="var(--accent-teal)" />
      <rect x="60" y="176" width="70" height="8" rx="4" fill="var(--text-muted)" opacity="0.5" />
    </g>
    <path d="M200 110 H224" stroke="var(--border-color)" strokeWidth="3" strokeDasharray="4 6" />
    <circle cx="230" cy="110" r="10" fill="var(--accent-coral)" stroke="var(--bg-page)" strokeWidth="4" />

    {/* Frame 2: heart, right */}
    <g transform="rotate(4 340 250)">
      <rect x="258" y="190" width="170" height="150" rx="18" fill="var(--bg-card)" stroke="var(--text-primary)" strokeWidth="3" />
      <rect x="272" y="204" width="142" height="100" rx="10" fill="var(--accent-pink)" opacity="0.3" />
      <path d="M343 282 C300 252 312 220 336 228 C341 230 343 234 343 234 C343 234 346 230 351 228 C375 220 386 252 343 282 Z" fill="var(--accent-coral)" />
      <rect x="290" y="316" width="70" height="8" rx="4" fill="var(--text-muted)" opacity="0.5" />
    </g>
    <path d="M236 270 H258" stroke="var(--border-color)" strokeWidth="3" strokeDasharray="4 6" />
    <circle cx="230" cy="270" r="10" fill="var(--accent-cyan)" stroke="var(--bg-page)" strokeWidth="4" />

    {/* Frame 3: friends, left */}
    <g transform="rotate(-3 120 400)">
      <rect x="30" y="330" width="170" height="150" rx="18" fill="var(--bg-card)" stroke="var(--text-primary)" strokeWidth="3" />
      <rect x="44" y="344" width="142" height="100" rx="10" fill="var(--accent-amber)" opacity="0.3" />
      <circle cx="84" cy="384" r="14" fill="var(--accent-indigo)" />
      <circle cx="115" cy="378" r="16" fill="var(--accent-coral)" />
      <circle cx="148" cy="386" r="13" fill="var(--accent-teal)" />
      <path d="M62 444 C62 412 106 412 106 444 Z M95 444 C95 408 138 408 138 444 Z" fill="var(--text-primary)" opacity="0.18" />
      <rect x="60" y="456" width="70" height="8" rx="4" fill="var(--text-muted)" opacity="0.5" />
    </g>
    <path d="M200 390 H224" stroke="var(--border-color)" strokeWidth="3" strokeDasharray="4 6" />
    <circle cx="230" cy="390" r="10" fill="var(--accent-amber)" stroke="var(--bg-page)" strokeWidth="4" />

    {/* Sparkles */}
    <path d="M400 80 l6 16 16 6 -16 6 -6 16 -6 -16 -16 -6 16 -6z" fill="var(--accent-amber)" />
    <path d="M60 280 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" fill="var(--accent-pink)" />
  </svg>
);

/** Small friendly nest mark for empty states and headers. */
export const NestMark: React.FC<{ className?: string }> = ({ className = 'w-10 h-10' }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
    <ellipse cx="24" cy="32" rx="18" ry="10" fill="var(--accent-amber)" />
    <path d="M8 30 C16 40 32 40 40 30" stroke="#1e2142" strokeWidth="3" strokeLinecap="round" />
    <circle cx="17" cy="24" r="6" fill="var(--accent-coral)" />
    <circle cx="30" cy="22" r="7" fill="var(--accent-cyan)" />
  </svg>
);
