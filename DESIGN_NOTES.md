# UI / UX system — “Lumen Timeline”

A full interface pass over Nest: new design tokens, a shared component kit, rebuilt pages,
and a timeline-first information architecture. **No backend, route, schema or permission
change** — every screen still talks to the same API.

---

## 1. Design language

| Layer | Before | Now |
| --- | --- | --- |
| Palette | indigo-navy + amber/coral stickers | deep “ink” canvas (`#0a0c14`) with **ember** (amber → coral) primary and **mint/cyan/indigo** status accents; light mode is warm paper (`#f7f2e9`) |
| Surfaces | flat cards with hard 2px borders and offset “sticker” shadows | layered glass: hairline borders, top-light gradient, 22–26px radii, ambient aurora + film grain behind everything |
| Type | mixed sizes, heavy all-caps | Fraunces display / Plus Jakarta body / JetBrains Mono for metadata, with a consistent `eyebrow` label style |
| Motion | scattered `animate-in` | one vocabulary: `fade-up`, `panel-in`, `scrim-in`, `shimmer`, `floaty`, `pulse-dot` — all disabled under `prefers-reduced-motion` |
| Controls | ad-hoc tailwind per button | `.btn` (`primary / soft / ghost / danger / icon`), `.chip`, `.field`, `.label`, `.surface`, `.modal-panel`, `.scrim` |

Tokens live in `src/index.css` (`:root` dark + `:root.light`). Everything else reads
`var(--bg-card)`, `var(--accent-amber)`, `var(--gradient-ember)` … so themes swap live.

---

## 2. New layout

```
┌──────────────────────── Header (glass, sticky) ────────────────────────┐
│ brand · selected circle · ⌘K palette · theme · duplicates · bell · user │
├──────────────┬─────────────────────────────────────────────────────────┤
│ SideNav      │ page content                                            │
│ (≥1024px)    │  • Timeline: hero → search/filters → month-grouped rail  │
│ nav + circles│  • Events: hero + stats + chapter grid                  │
│ + upload CTA │  • Circles: hero + stats + circle cards                 │
│              │  • Admin studio · Trash                                 │
└──────────────┴─────────────────────────────────────────────────────────┘
   < 1024px: floating bottom bar (Timeline · Events · ⊕ · Circles · Admin/Trash)
```

* **`SideNav`** replaces the cramped initials rail: labelled nav with counts, the circle
  list with member counts and accents, “manage members”, and a persistent *Add memory* CTA.
* **`BottomNav`** is a floating glass pill with a raised ember upload button and safe-area padding.
* **`Header`** is slimmer, holds the command palette trigger, and its menus are rebuilt on the
  kit’s `Dropdown`/`Modal` primitives (notifications now show relative times).

## 3. Component kit (`src/components/ui/`)

`kit.tsx` — `Avatar` (deterministic gradients), `Badge`, `Modal` + `ModalHeader` (portal, ESC,
scroll lock), `Segmented`, `Dropdown`, `MenuItem`, `EmptyState`, `StatTile`, `SkeletonCard`,
`SearchBox`, `ScrollChips`, `PageHero`, `Dot`.
`Feedback.tsx` — `FeedbackProvider` with `useFeedback()` → global toast stack + promise-based
confirm dialog (used by the shell; available to any future screen).

## 4. Timeline (`TimelineFeed.tsx`, rebuilt)

* Month markers are **sticky** pills that also summarise “12 memories · 4 people”.
* Each memory gets a **glowing day node on the rail** plus a day/month chip above the card, so
  the rail reads as a real chronology; newest month first, undated items collected at the end.
* Cards: author → time → circle line, hover-revealed quick actions (comment / open / media count),
  media collages unchanged (1–5+ layouts preserved), footer chips for comments + share.
* Everything previously in the three-dot menu is preserved (edit date/caption, convert to event,
  circles & permissions, remove from circle, delete with trash/permanent choice, report) but rebuilt
  on the kit dropdown + modals.
* Event cards show mosaic, attendee/place/date metadata, and the same management actions.
* Empty states now differentiate “nothing here yet” from “filters matched nothing”.

## 5. Pages

* **Timeline** – `HeroBand` greeting (time-of-day + weekday, circle context, live counters,
  primary actions) → `PendingReferencesBanner` → `FeedSearchBar` → timeline → load-earlier.
* **Events** – hero, 4 stat tiles, search + type filters + sort, “Coming up” vs “Earlier chapters”
  split, rich chapter cards. Kills the old double-render of `TimelineFeed` for events.
* **Circles** – hero, membership stats, search, circle cards with member stacks, accents,
  manage/feed/delete actions and an explainer for *Everyone*.
* **Admin studio** – hero with storage/database health chips + maintenance actions, stat tiles and
  a pill tab bar; all existing panels (signups, proposals, people, circles, reports, audit) unchanged.
* **Trash** – hero, stats, preview-protection notice, search, thumbnail rows with days-left countdown.
* **Auth** – two-column editorial screen (brand story + feature rail + decorative timeline) beside a
  focused glass form; same login / register / reset-link flows.
* **Pending approval** – status timeline with live poll, check-status and sign-out.
* **Command palette (⌘K / Ctrl-K)** – jump to any page or circle, search memories, upload,
  propose an event, open the duplicate cleaner, flip the theme. This is the “every feature” surface.

## 6. Consistency sweep across the remaining screens

Modals (upload, viewer, comments drawer, collection detail, group management, duplicates,
permissions, photo editor, caption suggestions, share, add-photos) now share the same scrim,
panel radius/shadow and theme tokens (hard-coded `#16162a / #1e1e38 / #2b2b52` and light-mode
`text-neutral-*` values removed). Removed the unused `FeedItemCard` and `CircleRail` components.

## 7. Files

```
src/index.css                     tokens + component classes + timeline CSS
src/lib/format.ts                 dates, relative time, initials, accents, plurals
src/components/ui/kit.tsx         design-system primitives
src/components/ui/Feedback.tsx    toasts + confirm dialog
src/components/Header.tsx         rebuilt
src/components/SideNav.tsx        new desktop navigation
src/components/BottomNav.tsx      rebuilt mobile navigation
src/components/TimelineFeed.tsx   rebuilt timeline (collage logic preserved)
src/components/EventsPage.tsx     new
src/components/CirclesPage.tsx    new
src/components/CommandPalette.tsx new
src/components/AuthScreen.tsx     rebuilt
src/components/PendingApprovalScreen.tsx rebuilt
src/components/TrashView.tsx      rebuilt
src/components/AdminPanel.tsx     new hero/tabs/stats, same functionality
src/App.tsx                       new shell, heroes, palette wiring
```

`vite.config.ts` also gained `server.allowedHosts` so the app renders correctly behind the
preview proxy host (it previously returned `403 Blocked request` there).
