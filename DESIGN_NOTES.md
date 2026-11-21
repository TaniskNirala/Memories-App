# UI redesign notes
- Theme tokens live in `src/index.css` (light = warm paper, dark = midnight ink). Toggle is unchanged.
- Timeline: single column on phones, zigzag from 900px up (`.tl-*` classes in index.css, applied in TimelineFeed.tsx).
- All emojis replaced by SVG icons (lucide + `components/Illustrations.tsx`). Reactions still store the same keys in the database.
- Backend, routes, and every feature are untouched.
