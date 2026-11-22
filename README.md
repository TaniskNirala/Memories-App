# Nest — Private, Zero-Quota Memory & Media Vault

**Nest** is a self-hosted, invite-only memory, photo, video, and event archive built for families and close friend circles. Unlike public social platforms or SaaS photo clouds with per-seat storage tiers, Nest runs as a single deployable Node.js + React Progressive Web App (PWA) backed by **Neon PostgreSQL** (with an ultra-fast local **SQLite** read cache) and **zero-quota Dual-Lane Telegram cloud storage** (plus optional **Backblaze B2 / Cloudflare R2 / AWS S3 / Local Disk** adapters).

Every photo, 4K video, album, comment thread, reaction, and event attendance tag respects strict, per-circle privacy boundaries: a single memory can live in multiple circles simultaneously while keeping conversations, reactions, and visibility isolated inside each circle—and cross-circle reshares stay locked behind an encrypted placeholder until the original photo owner explicitly approves them.

---

## Table of Contents

1. [Product Highlights & Core Capabilities](#1-product-highlights--core-capabilities)
2. [System Architecture](#2-system-architecture)
   - [Single-Process Express + Vite / SPA Server](#21-single-process-express--vite--spa-server)
   - [Hybrid Database Engine: Local SQLite Cache + Neon PostgreSQL](#22-hybrid-database-engine-local-sqlite-cache--neon-postgresql)
   - [Multi-Backend & Dual-Lane Storage Engine](#23-multi-backend--dual-lane-storage-engine)
   - [Two-Phase Upload Progress (XHR + SSE)](#24-two-phase-upload-progress-xhr--sse)
   - [HTTP 206 Range Media Streaming & Caching](#25-http-206-range-media-streaming--caching)
   - [Telegram Channel Deletion Watcher](#26-telegram-channel-deletion-watcher)
3. [Privacy, Permissions & Sharing Model](#3-privacy-permissions--sharing-model)
   - [User Roles & Invite-Only Onboarding](#31-user-roles--invite-only-onboarding)
   - [Circles (Groups) & The `Everyone` Circle](#32-circles-groups--the-everyone-circle)
   - [Multi-Circle Placements & Owner-Gated Reference Sharing](#33-multi-circle-placements--owner-gated-reference-sharing)
   - [Circle-Scoped Comments, `@mentions` & Emoji Reactions](#34-circle-scoped-comments-mentions--emoji-reactions)
   - [Admin Visibility Overrides & Preview Delete Protection](#35-admin-visibility-overrides--preview-delete-protection)
4. [Feature Walkthrough (Every Screen, Modal & Tool)](#4-feature-walkthrough-every-screen-modal--tool)
   - [Lumen Timeline Design System & Dual Theme Sync](#41-lumen-timeline-design-system--dual-theme-sync)
   - [Authentication, Onboarding & Password Reset](#42-authentication-onboarding--password-reset)
   - [Timeline Stream, Collages & Multi-Faceted Search Bar](#43-timeline-stream-collages--multi-faceted-search-bar)
   - [Global Drag-and-Drop & Ultra-HD 4K Upload Modal](#44-global-drag-and-drop--ultra-hd-4k-upload-modal)
   - [Full-Screen Media Viewer (Gestures, Grid/Expanded Modes)](#45-full-screen-media-viewer-gestures-gridexpanded-modes)
   - [Non-Destructive Canvas Photo Editor](#46-non-destructive-canvas-photo-editor)
   - [Time-Aware Gemini AI Storyteller & Caption Suggestions](#47-time-aware-gemini-ai-storyteller--caption-suggestions)
   - [Events & Curated Collections (Attendance, Notes, Proposals)](#48-events--curated-collections-attendance-notes-proposals)
   - [Circles Hub & Circle Management](#49-circles-hub--circle-management)
   - [Duplicate Photo Finder & Storage Cleaner](#410-duplicate-photo-finder--storage-cleaner)
   - [30-Day Safety-Net Trash Bin](#411-30-day-safety-net-trash-bin)
   - [Profile & Account Settings](#412-profile--account-settings)
   - [Command Palette (`⌘K` / `Ctrl+K`)](#413-command-palette-k--ctrlk)
   - [Admin Studio (6 Operational Tabs + Cloud & Storage Diagnostics)](#414-admin-studio-6-operational-tabs--cloud--storage-diagnostics)
   - [Progressive Web App (PWA) & Offline Indicator](#415-progressive-web-app-pwa--offline-indicator)
5. [Security Architecture & Hardening](#5-security-architecture--hardening)
6. [Complete Database Schema (20 Relational Tables)](#6-complete-database-schema-20-relational-tables)
7. [Complete REST API Reference](#7-complete-rest-api-reference)
8. [Repository Structure](#8-repository-structure)
9. [Environment Variables Reference](#9-environment-variables-reference)
10. [Local Development & Setup Guide](#10-local-development--setup-guide)
11. [Cloud Storage Setup Guides](#11-cloud-storage-setup-guides)
    - [Telegram Dual-Lane Setup (Bot API + GramJS MTProto)](#111-telegram-dual-lane-setup-bot-api--gramjs-mtproto)
    - [Backblaze B2 / Cloudflare R2 / AWS S3 Setup](#112-backblaze-b2--cloudflare-r2--aws-s3-setup)
12. [Production Deployment (Render + Neon PostgreSQL)](#12-production-deployment-render--neon-postgresql)
13. [CLI Operational Scripts & Automated Test Suite](#13-cli-operational-scripts--automated-test-suite)

---

## 1. Product Highlights & Core Capabilities

| Domain | Capabilities |
| :--- | :--- |
| **Invite-Only Vault** | New registrations land in a `pending` holding room with live 5-second approval polling. Pending and suspended accounts cannot access feeds, circles, comments, or raw media URLs. |
| **Zero-Quota Dual-Lane Storage** | Stores photos, audio, and multi-gigabyte videos in a private Telegram channel: **Lane 1 (Bot API)** handles fast uploads `≤ 15 MB`; **Lane 2 (Embedded GramJS MTProto or External NotaForge Server)** handles large videos up to **`2 GB`** with 8 parallel workers and HTTP `206 Partial Content` byte-range streaming. |
| **Hybrid B2/S3 Read Fallback** | When `STORAGE_BACKEND="telegram"` is paired with S3/Backblaze B2 credentials, all new uploads go to Telegram while legacy `posts/...` keys transparently stream from Backblaze B2 / Cloudflare R2 / AWS S3. |
| **Durable Neon + SQLite Engine** | Every SQL read executes synchronously in sub-millisecond time against a local `libsql` SQLite file, while every write (`INSERT`/`UPDATE`/`DELETE`) queues in order to **Neon PostgreSQL** and flushes before the HTTP response finishes. |
| **Owner-Gated Reference Sharing** | Members can reshare a post into another circle they belong to (`POST /api/placements/bunch`), creating an `is_reference = 1` placement with `pending_owner_approval`. Viewers in the target circle see a **Locked Placeholder** until the owner clicks **Allow**. |
| **Circle-Isolated Social Threads** | Every comment, nested reply, `@mention` autocomplete list, and emoji reaction (`❤️`, `🔥`, `😂`, `👏`, `🎉`, `😮`) is bound to `(target_type, target_id, group_id)`. Conversations never leak across circles. |
| **Ultra-HD 4K Media Pipeline** | Client-side EXIF `DateTimeOriginal` extraction (`exifr`), zero-loss passthrough for images `≤ 4096px` & `< 25 MB`, crisp `960px` Retina JPEG thumbnails, automatic browser HTML5 `<video>` poster frame capture, and SHA-256 file checksumming. |
| **Built-In Canvas Photo Editor** | Crop (`free`, `1:1`, `4:3`, `3:4`, `16:9`, `9:16` with 8 drag handles), rotate `±90°`, flip horizontally, and save non-destructively during upload or directly over an existing post photo. |
| **Time-Aware Gemini AI Captions** | Uses `@google/genai` (`gemini-3.8-flash` with fallback to `gemini-flash-latest` and deterministic offline heuristics) enriched with computed era, elapsed years, season, time-of-day, and circle context to craft nostalgic or witty captions. |
| **Events & Curated Collections** | Upcoming/past split, 4-tile mosaic cards, `60`-item paginated photo grids, self or peer attendance tagging (`I was there` / tag friends), public or anonymous event memory notes, member event proposals, and 1-click post-to-event conversion. |
| **Smart Duplicate Cleaner** | Pre-upload duplicate detection (SHA-256 checksum + byte size) and a vault-wide Duplicate Cleaner modal that calculates wasted bytes, merges circle placements onto the kept original, or remembers **"Keep Both"** choices per user. |
| **Lumen Timeline UI & PWA** | Warm sunlit-paper light theme (`#f7f2e9`) and obsidian dark theme (`#0a0c14`) persisted per user account across devices, Fraunces + Plus Jakarta Sans + JetBrains Mono typography, `⌘K` Command Palette, installable PWA (`manifest.json` + service worker + iOS Safari install guide), and live offline indicator. |

---

## 2. System Architecture

```text
┌───────────────────────────────────────────────────────────────────────────────────┐
│                         Browser / Installed PWA (React 19)                        │
│  Lumen Timeline UI • Tailwind CSS v4 • @use-gesture • exifr • XHR + SSE Uploader  │
└───────────────────────┬───────────────────────────────────────┬───────────────────┘
                        │ REST JSON / SSE (httpOnly Cookie)     │ Media <img/video>
                        ▼                                       ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                        Express 4 Monolith Server (server.ts)                      │
│  Security Headers • Strict CORS • Rate Limiters • Session & Per-File Media Guard  │
├───────────────────────────────────┬───────────────────────────────────────────────┤
│     Database Layer (server/db.ts) │          Storage Layer (server/storage/)      │
│  ┌─────────────────────────────┐  │  ┌─────────────────────────────────────────┐  │
│  │ Local SQLite (data/kinfolk) │  │  │ HybridTelegramB2Adapter / Active Router │  │
│  │ Synchronous <1ms Reads      │  │  ├────────────────────┬────────────────────┤  │
│  └──────────────┬──────────────┘  │  │ Lane 1: Bot API    │ Lane 2: MTProto    │  │
│                 │ Ordered Write   │  │ <= 15 MB (tg:...)  │ <= 2 GB (tgmsg:..) │  │
│                 │ Queue + Flush   │  │ 15 MB Local Cache  │ HTTP 206 Streaming │  │
│                 ▼                 │  ├────────────────────┴────────────────────┤  │
│  ┌─────────────────────────────┐  │  │ S3 / Backblaze B2 / R2 / Local Disk     │  │
│  │ Neon PostgreSQL (Cloud SoT) │  │  │ Presigned URLs • Disk Write-Through     │  │
│  │ Auto-Bootstrapped 20 Tables │  │  │ 5-Min Telegram Channel Deletion Watcher │  │
│  └─────────────────────────────┘  │  └─────────────────────────────────────────┘  │
└───────────────────────────────────┴───────────────────────────────────────────────┘
```

### 2.1 Single-Process Express + Vite / SPA Server
- **Entry point (`server.ts`)**: Exposes `createApp()` (used by both production startup and the isolated integration test server) and `startServer()` (binds to `0.0.0.0:${PORT || 3000}`).
- **Development mode**: Dynamically mounts Vite's dev server in middleware mode (`appType: 'spa'`) so frontend HMR and `/api/*` routes share one origin and port without CORS friction.
- **Production mode (`NODE_ENV=production`)**: Serves prebuilt static assets from `dist/` and falls back to `dist/index.html` for client-side navigation.
- **Graceful Shutdown**: Intercepts `SIGTERM` and `SIGINT`, stops the background Telegram deletion watcher, awaits `flushNeonWrites()`, and cleanly closes the Neon PostgreSQL connection pool before exiting.

### 2.2 Hybrid Database Engine: Local SQLite Cache + Neon PostgreSQL
Implemented across `server/db.ts` and `server/neon.ts`:
1. **Synchronous Local Read Cache (`better-sqlite3` via `@libsql/client`)**:
   - Stored at `DB_PATH` or `${DATA_DIR}/kinfolk.sqlite` (defaults to `./data/kinfolk.sqlite`, with automatic fallback to `/tmp/kinfolk-data` if the filesystem is read-only).
   - Configured with `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`.
   - Every route handler uses synchronous helpers (`queryOne`, `queryAll`, `run`) for zero-latency joins across feeds, permissions, and media access checks.
2. **Automatic Schema Creation & Column Migrations**:
   - All **20 relational tables** and **6 performance indexes** are automatically created on boot in both SQLite and Neon PostgreSQL (`ensureNeonSchema()`).
   - Automatic `ALTER TABLE` migrations add newer columns (`users.avatar_url`, `users.theme_preference`, `post_files.checksum`, `post_files.tg_deleted_at`) idempotently on existing databases.
3. **Cold-Boot Hydration from Neon**:
   - When `DATABASE_URL` (or `NEON_DATABASE_URL` / `POSTGRES_URL`) is set, `pullAllFromNeon()` runs on startup. In topological foreign-key order (`TABLES_IN_ORDER`), it clears ephemeral local cache tables and populates SQLite with the exact state from Neon—surviving ephemeral container restarts on Render, Railway, or Fly.io.
   - If the Neon database is brand new (`0` users) while local SQLite already has data, it automatically pushes all local tables up to Neon instead (`pushAllToNeon()`).
4. **SQLite-to-PostgreSQL Dialect Translator (`translateToPg`)**:
   - Transparently rewrites SQLite queries into native PostgreSQL: converts `INSERT OR IGNORE INTO t ...` to `INSERT INTO t ... ON CONFLICT DO NOTHING`, converts `INSERT OR REPLACE INTO t (cols) VALUES (...)` to `INSERT INTO t (cols) VALUES (...) ON CONFLICT (<pk>) DO UPDATE SET ...` using per-table primary key metadata (including composite keys like `group_members(group_id, user_id)` and `event_attendance(event_id, user_id)`), and rewrites `?` placeholders to `$1, $2, ...` while respecting string literals.
5. **Write-Through Durability Middleware**:
   - Every `run()` call mutates local SQLite immediately and enqueues the corresponding PostgreSQL statement onto an ordered promise chain (`enqueueNeonWrite`).
   - An Express middleware intercepts `res.end` on every `POST`, `PUT`, `PATCH`, and `DELETE` request and awaits `flushNeonWrites()` before sending the HTTP response—guaranteeing that once the browser receives `200`/`201`, the write is durably committed in Neon.

### 2.3 Multi-Backend & Dual-Lane Storage Engine
Configured via `server/storage/index.ts` and `STORAGE_BACKEND`:

| Backend Mode | Storage Keys Produced | Max File Size | How It Works |
| :--- | :--- | :--- | :--- |
| **`telegram` (Dual-Lane)** | `tg:<file_id>@<msg_id>/<name>` (Lane 1)<br>`tgmsg:<msg_id>/<name>` (Lane 2) | **`2 GB`** (`2000 MB`) | **Lane 1 (Bot API)** uploads files `≤ 15 MB` via multipart `sendDocument`. **Lane 2 (MTProto)** uploads files `> 15 MB` up to `2 GB` via embedded GramJS (`TelegramMtprotoClient`, 8 parallel workers, 512 KB chunks) or an external NotaForge `telegram-server`. If `TELEGRAM_API_BASE_URL` points to a self-hosted Bot API server, Lane 1 also scales to `2 GB`. |
| **`telegram` (Bot-Only)** | `tg:<file_id>@<msg_id>/<name>` | **`20 MB`** | Active when `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` are set without MTProto credentials (Telegram's hosted `getFile` download ceiling is 20 MB). |
| **`telegram` + S3/B2 Hybrid** (`HybridTelegramB2Adapter`) | New: `tg:` / `tgmsg:`<br>Legacy: `posts/<userId>/...` | **`2 GB`** (or `20 MB`) | Activated automatically when Telegram is configured alongside S3/B2 env vars. All new uploads go to Telegram; existing `posts/...` keys seamlessly read/stream from Backblaze B2 / S3. |
| **`s3` / `b2` / `r2`** (`S3StorageAdapter`) | `posts/<userId>/<ts>_<uuid>.<ext>` | **`500 MB`** | Uses `@aws-sdk/client-s3` with `forcePathStyle: true`, automatic Backblaze B2 region extraction (`s3.<region>.backblazeb2.com`), presigned PUT/GET URLs, and a 3-minute in-memory bucket key catalog (`refreshBucketIndex`) that repairs case/extension mismatches automatically. |
| **`local`** (`LocalDiskStorageAdapter`) | `posts/<userId>/<ts>_<uuid>.<ext>` | **`500 MB`** | Stores files under `./uploads/` with `HMAC-SHA256` signed upload (`15m` TTL) and view (`1h` TTL) tokens verified via `crypto.timingSafeEqual`. |

- **Smart Thumbnail Deduplication on Telegram**: For images under `250 KB`, Nest skips uploading a redundant thumbnail document to Telegram and reuses `mainStorageKey` as `thumbStorageKey`, halving Bot API calls on compact uploads.
- **Archive-on-Delete Semantics**: Deleting a memory in Nest removes or soft-deletes database rows while preserving the backing Telegram channel message as an immutable off-site backup (`archiveOnDelete: true`).

### 2.4 Two-Phase Upload Progress (XHR + SSE)
Implemented in `src/utils/uploadWithProgress.ts` and `server/routes/posts.ts`:
- **Phase 1 (`0% → 30%`)**: Browser-to-Nest multipart transfer tracked in real time via `XMLHttpRequest.upload.onprogress`.
- **Phase 2 (`30% → 100%`)**: Before starting the POST, the client opens an authenticated Server-Sent Events stream (`GET /api/posts/upload-progress/:uploadId`, with 20-second keep-alive heartbeats and `X-Accel-Buffering: no`). As the server transfers chunks to Telegram Bot API or MTProto, progress callbacks stream `0–100%` events mapped smoothly onto `30%–99%` on the client UI bar, finishing at `100%` on `event: done`.

### 2.5 HTTP 206 Range Media Streaming & Caching
- **Clean Video URLs (`/api/storage/file/:msgId/:fileName`)**: MTProto files resolve to clean filename URLs so Safari, iOS WebKit, Chrome, and Firefox HTML5 `<video>` players recognize MIME types and issue `Range: bytes=start-end` scrub requests natively.
- **MTProto Chunk Streaming**: `TelegramMtprotoClient.streamDownload()` slices byte ranges (`iterDownload` aligned to `4 KB` / `1 MB` MTProto boundaries) and streams `206 Partial Content` directly to the browser without buffering multi-hundred-MB videos in RAM.
- **Bot API Local Disk Cache**: `TelegramStorageAdapter` caches downloaded Bot API files (`≤ 15 MB`) in `/tmp/kinfolk-tg-cache` (capped at `300` files with oldest-mtime eviction) and serves subsequent requests and byte-range slices straight from local disk.
- **S3/B2 Write-Through Disk Cache**: `/api/storage/view` pipes S3/B2 object streams through dual `PassThrough` streams—one directly to the HTTP response and one to `./uploads/` in the background—turning cold cloud reads into instant local byte-range reads on every repeat view.

### 2.6 Telegram Channel Deletion Watcher
Implemented in `server/storage/tg-deletion-sync.ts`:
- Because Telegram never pushes webhook events when an admin deletes a message directly inside a Telegram channel, Nest runs a background scanner (`startTelegramDeletionWatcher()`, default every **`5` minutes**, initial scan `20s` after boot, configurable via `TELEGRAM_DELETE_CHECK_MINUTES`).
- **MTProto (`tgmsg:`) keys** are checked in fast batches of `100` message IDs via `client.getMessages()`.
- **Bot API (`tg:<file_id>@<msg_id>/...`) keys** are probed in rotating slices (`TELEGRAM_DELETE_CHECK_BOT_BATCH`, default `60` per run) to stay well clear of Telegram rate limits.
- Missing channel messages stamp `post_files.tg_deleted_at`, surfacing a red **`Deleted from TG`** badge (`TgDeletedBadge`) on timeline cards, album grids, and the media viewer. If a message reappears, `tg_deleted_at` is cleared automatically. Admins can also trigger an immediate scan from Admin Studio (`POST /api/admin/telegram/check-deleted`).

---

## 3. Privacy, Permissions & Sharing Model

### 3.1 User Roles & Invite-Only Onboarding
Every account in `users` has a `role` (`admin` | `member` | `pending`) and `status` (`active` | `suspended`):
1. **Bootstrap Admin**: On an empty database (`0` users), the first registered user becomes `admin` **only** if `BOOTSTRAP_ADMIN_USERNAME` matches their username (or in non-production local dev when `BOOTSTRAP_ADMIN_USERNAME` is unset). Otherwise, even the first user starts as `pending`.
2. **Pending Users (`role = 'pending'`)**: Restricted by `requireApproved` middleware across all data routers and media endpoints. They see only `PendingApprovalScreen`, which polls `/api/auth/me` every 5 seconds until an admin approves them.
3. **Approved Members (`role = 'member'`)**: Automatically added to the global `Everyone` circle upon approval, notified in-app, and granted access to circles they belong to.
4. **Suspended Users (`status = 'suspended'`)**: Immediately blocked at login, API middleware, and media streaming endpoints (`403 Forbidden`), with active sessions invalidated on suspension.
5. **Admins (`role = 'admin'`)**: Can approve/reject signups, manage users and circles, generate one-time password reset links, review event proposals and content reports, set post visibility overrides, inspect audit logs, and run database/storage diagnostics.

### 3.2 Circles (Groups) & The `Everyone` Circle
- **Circles** (`groups` + `group_members`) represent private spaces—e.g., *Immediate Family*, *College Crew*, *Summer Roadtrip*, or a 2-person circle.
- **`Everyone` Circle (`is_everyone = 1`)**: Auto-created and auto-populated with every approved member. It cannot be deleted (`DELETE /api/groups/:id` rejects deletion of `is_everyone` groups).
- Any approved member can create new custom circles (`POST /api/groups`), invite approved members, edit circle details (creator or admin), or leave/remove members. Deleting a circle removes the channel and its placements while keeping every underlying post safely owned by its uploader.

### 3.3 Multi-Circle Placements & Owner-Gated Reference Sharing
Posts and albums are linked to circles via the `item_groups` join table rather than a single `group_id` column:
- **Private Vault Posts**: A post with zero rows in `item_groups` is strictly private—visible only to its `owner_id` (and admins).
- **Direct Owner Sharing**: When the post's owner (or an admin) shares a post into one or more circles, `item_groups` records `is_reference = 0, reference_status = 'approved'`. Members of those circles see the memory immediately.
- **Cross-Circle Reference Requests (`is_reference = 1`)**: When a member views someone else's post in Circle A and reshares it into Circle B (`POST /api/placements/bunch`), Nest creates a placement with `is_reference = 1` and `reference_status = 'pending_owner_approval'` and sends a `reference_request` notification to the photo's owner.
- **Locked Placeholder Enforcement**: Members of Circle B who do not already have access via Circle A receive `isLockedPlaceholder: true` with an empty `files: []` array in `/api/feed` (rendered via `LockedPlaceholder.tsx`), and direct requests to `/api/storage/view` or `/api/posts/:id` are denied until the owner clicks **Allow** in `PendingReferencesBanner` (`POST /api/placements/pending-references/:placementId/decide`).
- **Granular Viewing Permissions Modal (`ViewingPermissionsModal.tsx`)**: Owners and admins can toggle any combination of circles on or off at any time (`POST /api/placements/adjust-permissions`), with quick actions for *Everyone*, *Select All Circles*, or *Private Only (Clear All)*.

### 3.4 Circle-Scoped Comments, `@mentions` & Emoji Reactions
- Both `comments` and `reactions` include a required `group_id` column.
- If a photo is shared in both *Family* and *Weekend Hikers*, comments and reactions posted while viewing *Weekend Hikers* are completely invisible to *Family* members who are not in *Weekend Hikers*.
- Typing `@` in `CommentsDrawer` queries `GET /api/comments/group-members/:groupId` and suggests **only** active members of that specific circle; submitting a comment with `@username` records rows in `mentions` and dispatches a deep-linked `mention` notification (`/post/:id?group=:groupId&comment=:commentId`) that opens the exact circle context and scrolls smoothly to the highlighted comment.

### 3.5 Admin Visibility Overrides & Preview Delete Protection
- **Visibility Overrides (`posts.visibility_override`)**: Admins can set a post to `public_all` (visible to all approved members regardless of circle) or `hidden` (hidden from everyone except the owner and admins), logged automatically in `audit_log`.
- **Preview Delete Protection (`server/config.ts`)**: Controlled by `PROTECT_DELETE`. Defaults to `false` on Render (`RENDER=true`) and standard deployments; if `PROTECT_DELETE=true` is set (e.g., on shared demo sandboxes), destructive endpoints (`DELETE /api/posts/:id`, `DELETE /api/albums/:id`, `DELETE /api/posts/:id/files/:fileId`, `POST /api/posts/duplicates/resolve`) return `403` and the UI displays a clear protection badge.

---

## 4. Feature Walkthrough (Every Screen, Modal & Tool)

### 4.1 Lumen Timeline Design System & Dual Theme Sync
- **Aesthetic**: Editorial scrapbooking meets tactile modern glassmorphism ("Lumen Timeline").
  - **Light Mode (Default)**: Sunlit warm paper (`#f7f2e9`), crisp elevated surfaces, coral (`#ff7069`) + warm amber (`#f6b544`) accents.
  - **Dark Mode**: Deep obsidian night (`#0a0c14`) with soft hairline borders and warm ambient radial glows.
- **Typography**: `Fraunces` (variable optical-size serif display headings), `Plus Jakarta Sans` (UI & body copy), and `JetBrains Mono` (timestamps, badges, storage keys, kbd hints).
- **Zero-Flash Account + Device Theme Sync (`ThemeContext.tsx` + `index.html`)**:
  - An inline pre-paint script in `index.html` applies `localStorage['kinfolk_theme']` before React mounts so dark-mode users never see a white flash.
  - Once signed in, `users.theme_preference` (`'dark' | 'light'`) syncs via `PATCH /api/auth/me` so signing in on a new phone or laptop automatically adopts the user's chosen palette. If a user picks a theme on the login card before signing into an account with no saved preference, that choice carries forward automatically.
- **3-Column Responsive Desktop Shell**:
  - **Left Rail (`SideNav.tsx`)**: Primary navigation (`Timeline`, `Events`, `Circles`, `Trash`, `Profile`, plus `Admin` for admins) with live item badges, primary **Add Memory** CTA, and quick circle filter list.
  - **Center Column**: Independently scrollable timeline/page viewport (`max-w-[880px]`).
  - **Right Rail (`HeroRail.tsx`)**: Time-of-day personalized greeting (`Good morning/afternoon/evening`), live archive stat counters (circles, memories, contributors), and active circle context card. Collapses into a compact inline header + horizontal chip scroller on mobile/tablet, paired with `BottomNav.tsx`.

### 4.2 Authentication, Onboarding & Password Reset
- **`AuthScreen.tsx`**: Illustrated split-card onboarding with three modes:
  1. **Sign In**: Username + password login with show/hide password toggle and theme switcher.
  2. **Create Account**: Username (`3–30` chars, `[a-z0-9_-]`), display name (`≤ 60` chars), and validated password.
  3. **Reset Link**: Automatically activates whenever the URL query or hash contains `?token=...` or `#token=...`—even if another account is currently signed in on that browser—or accepts a pasted reset URL or raw token manually (`extractResetTokenFromText`).

### 4.3 Timeline Stream, Collages & Multi-Faceted Search Bar
- **Chronological Grouping (`TimelineFeed.tsx`)**: Groups single posts and approved event/collection cards by Month & Year headers, sorted by `taken_at` (EXIF capture date) or `uploaded_at` (`date_basis`).
- **Adaptive Multi-Photo Collages (`PostCollage`)**: Renders crisp 1-photo hero frames, 2-photo split grids, 3-photo asymmetric layouts, and 4+ photo mosaics with `+N` count overlays, inline HTML5 video players with custom poster frames, and 4-stage automatic image fallback recovery (`thumb` → `full` → `/api/storage/view` → `/uploads` → vector placeholder).
- **Search & Filter Bar (`FeedSearchBar.tsx`)**:
  - Real-time deferred text search (`useDeferredValue`) across captions, event titles/descriptions, contributor names/handles, and circle names.
  - Collapsible filter drawer with **Contributor** selector, auto-extracted **`#hashtag` & Circle tag** pills, **Date Presets** (*All time*, *7 days*, *This month*, *3 months*, *This year*), and custom **Start / End Date** pickers.

### 4.4 Global Drag-and-Drop & Ultra-HD 4K Upload Modal
- **Drop Anywhere**: Dragging image, video, or audio files anywhere onto the browser window reveals a full-screen amber drop overlay and opens `UploadModal.tsx` pre-loaded with those files.
- **`UploadModal.tsx` Capabilities**:
  - Reads EXIF `DateTimeOriginal` / `CreateDate` via `exifr` to backdate memories accurately to when they were taken, or lets the user pick a custom date/time or toggle `taken_at` vs `uploaded_at` sorting.
  - Preserves untouched original files up to `4096px` (`Ultra-HD 4K`) and `< 25 MB`; smoothly downscales larger dimensions at `0.95` quality while generating a `960px` Retina thumbnail (`0.88` JPEG).
  - Extracts crisp JPEG poster frames from videos client-side (`extractVideoThumbnail`).
  - Runs pre-upload duplicate checks (`POST /api/posts/check-duplicates`) warning if a photo is already in the vault.
  - Supports inline **Photo Editor** cropping/rotating per queued photo, **AI Caption Generation** right inside the composer, multi-circle target selection, and uploading either as a **Unified Multi-Photo Post** or **Separate Individual Posts**, or directly creating/attaching to an **Event / Album**.

### 4.5 Full-Screen Media Viewer (Gestures, Grid/Expanded Modes)
- **`MediaViewerModal.tsx`**:
  - **Dual View Modes**: Multi-photo memories open in a clean **Masonry/Grid Overview** (`grid` mode) or **Full-Screen Lightbox** (`expanded` mode) with keyboard (`←`, `→`, `Escape`) and thumbnail strip navigation.
  - **Touch & Trackpad Gestures (`@use-gesture/react`)**: Pinch-to-zoom (`1x` to `6x`), scroll-wheel zoom, click/drag panning when zoomed in, and 1-click zoom reset.
  - **Rich Action Bar**: Edit photo (`PhotoEditorModal`), append more photos to an existing post (`AddPhotosToAlbumModal`), generate/apply AI captions (`CaptionSuggestionsModal`), convert post into an Event (`POST /api/posts/:id/convert-to-event`), manage circle viewing permissions (`ViewingPermissionsModal`), reshare (`SharePlacementModal`), open circle comments (`CommentsDrawer`), apply admin visibility overrides, or delete a single photo from a multi-photo post (`DELETE /api/posts/:id/files/:fileId`).

### 4.6 Non-Destructive Canvas Photo Editor
- **`PhotoEditorModal.tsx`**: Works both pre-upload (in `UploadModal`) and post-upload (in `MediaViewerModal` via `PUT /api/posts/:id/files/:fileId`).
- Supports `90°` CW/CCW rotation, horizontal mirror flip, aspect-ratio presets (`Free`, `1:1`, `4:3`, `3:4`, `16:9`, `9:16`), interactive pointer-captured corner/edge/move crop handles, high-quality HTML5 `<canvas>` rendering, and **"Save"** or **"Save & Share"** workflows.

### 4.7 Time-Aware Gemini AI Storyteller & Caption Suggestions
- **`server/routes/ai.ts` + `CaptionSuggestionsModal.tsx`**:
  - Computes rich `TemporalContext` (`formatTemporalContext`) from `takenAt`: exact date, era (`80s retro`, `90s vintage`, `2000s throwback`, `2010s throwback`, `contemporary`), elapsed years/months, season, and time of day (`morning`, `afternoon`, `golden hour / sunset`, `evening`, `night`).
  - Prompts Google Gemini Vision (`gemini-3.8-flash` → fallback `gemini-flash-latest`) to inspect actual people, lighting, expressions, and era nostalgia while forbidding generic AI clichés.
  - Returns a primary caption, 3 distinct tone variations (*Nostalgic & Time-Honored*, *Fun & Witty*, *Short & Minimal*), and contextual `#tags`.
  - Includes a deterministic offline/rate-limit heuristic engine (`getHeuristicCaptions`) so caption suggestions always succeed even without an API key or internet access.

### 4.8 Events & Curated Collections (Attendance, Notes, Proposals)
- **`EventsPage.tsx`**: Dedicated hub featuring summary `StatTile` counters (*Places*, *Photos*, *Attended*, *Contributors*), search, filter pills (*All*, *Events*, *Collections*, *Attended*), sort modes (*Recent*, *Oldest*, *Biggest*), and automatic **Upcoming** vs **Past** sections.
- **`ProposeCollectionModal.tsx`**: Admins create approved events/collections immediately; members submit proposals (`status = 'pending_approval'`) that notify admins for 1-click approval in Admin Studio.
- **`CollectionDetailModal.tsx`**:
  - Loads collection metadata, event date, and location (`eventPlace`).
  - Paginates items `60` photos at a time (`GET /api/albums/:id/items?limit=60&offset=...`).
  - **Add Photos (`AddPhotosToAlbumModal.tsx`)**: Upload brand-new photos/videos directly into the event OR pick existing memories from your library.
  - **Attendance Roll (`event_attendance`)**: Mark `"I was there"` for yourself or tag other circle members who attended (`POST /api/albums/:id/attendance`).
  - **Shared Memory Notes (`event_notes`)**: Leave written stories or reflections on an event, optionally toggled as **Anonymous** (`is_anonymous = 1`, which masks author identity in API responses while allowing the author or admin to remove it).
  - **Convert Collection to Event**: Upgrade a standard photo album into a dated, geo-tagged Event (`POST /api/albums/:id/convert-to-event`).

### 4.9 Circles Hub & Circle Management
- **`CirclesPage.tsx` & `GroupManagementModal.tsx`**: Browse all circles with member avatars, deterministic color accents (`accentFromName`), member search, circle creation, description editing, instant member addition/removal, and safe circle deletion.

### 4.10 Duplicate Photo Finder & Storage Cleaner
- **`DuplicateCleanerModal.tsx`**:
  - Scans active posts (`GET /api/posts/duplicates/list`) grouped by exact dimensions and byte size / SHA-256 checksum, displaying total duplicate count and reclaimable storage.
  - **Merge Circle Placements**: Optional toggle (enabled by default) copies circle placements from duplicate posts onto the kept original before deleting duplicates so no circle loses access.
  - **Keep Both (`ignored_duplicates`)**: Dismisses false positives or intentional duplicates per user (`POST /api/posts/duplicates/keep-both`), either per group or in bulk (*Keep All* / *Resolve All*).

### 4.11 30-Day Safety-Net Trash Bin
- **`TrashView.tsx`**: Soft-deleted posts (`posts.deleted_at IS NOT NULL`) move here first, showing total recoverable items, a 30-day retention window indicator, items expiring within 7 days, search filtering, 1-click **Restore** (`POST /api/posts/:id/restore`), and **Delete Forever** (`DELETE /api/posts/:id` with `{ permanent: true }`).

### 4.12 Profile & Account Settings
- **`ProfilePage.tsx`**:
  - Upload, replace, or remove a custom profile photo (`PNG`, `JPEG`, or `WebP` up to `2 MB`, stored via active storage adapter and served through `/api/storage/view`), or customize a 10-swatch fallback initials avatar color.
  - Update display name and `@username` (changing username requires current password re-authentication).
  - Change account password (rotates session and invalidates all other logged-in devices).
  - Toggle Light / Dark appearance (persisted to `users.theme_preference`).
  - **Sign out everywhere** (`POST /api/auth/logout-all`) or **Permanently delete account** (`DELETE /api/auth/account` with password confirmation—cleans up user media, sessions, memberships, and posts; refuses to strand the vault if the user is the sole active admin).

### 4.13 Command Palette (`⌘K` / `Ctrl+K`)
- **`CommandPalette.tsx`**: Keyboard-driven spotlight launcher (`↑`/`↓` navigation, `Enter` to execute, `Esc` to close) providing instant jumps to every tab, every circle feed, *Add a memory*, *Propose a new event*, *Find duplicate photos*, *Switch theme*, or full-text timeline search fallback when a query doesn't match a command.

### 4.14 Admin Studio (6 Operational Tabs + Cloud & Storage Diagnostics)
- **`AdminPanel.tsx`** (strictly guarded by `isAdmin` on client and `requireAdmin` on server):
  1. **Pending Signups**: Approve (adds to `Everyone` circle + sends welcome notification) or reject & remove pending registrations.
  2. **Users Directory**: View all members, role/status badges, suspend/unsuspend accounts, generate **1-hour one-time Password Reset Links & Reset Keys** (`POST /api/admin/generate-reset-link/:id` with 1-click copy), or permanently delete accounts.
  3. **Circles Overview**: Inspect and manage every circle across the instance.
  4. **Collection Proposals**: Approve or reject member-submitted albums and events.
  5. **Content Reports**: Review member-flagged posts/comments (`POST /api/reports`) and mark reports resolved or dismissed.
  6. **Audit Log**: Chronological ledger (`audit_log`, latest 200 entries) tracking admin approvals, rejections, suspensions, deletions, reset-link generations, visibility overrides, and moderation decisions.
  - **Database & Storage Diagnostic Modals**:
    - Live **Neon PostgreSQL** sync health, user/post counts, manual **Sync to Neon** (`POST /api/admin/db-sync`), and **Rebuild Cache from Neon** (`POST /api/admin/restore-turso`).
    - Live **Storage Diagnostics** showing active backend mode, max file size, Telegram file count vs legacy file count, **Live Lane Connection Test** (`POST /api/admin/storage-test` verifying Bot API, MTProto connection & channel title, and B2 fallback object count), **Scan Deleted Telegram Media** (`POST /api/admin/telegram/check-deleted`), **Recover Orphaned Bucket Media** (`POST /api/admin/sync-storage`), **Clear Feed**, and **Purge All Data**.

### 4.15 Progressive Web App (PWA) & Offline Indicator
- Configured via `vite-plugin-pwa` (`registerType: 'autoUpdate'`) + `public/manifest.json` + unified vector `/icon.svg`.
- **`PWAInstallButton.tsx`**: Captures `beforeinstallprompt` on Chrome/Edge/Android for native 1-click installation, and detects iPhone/iPad Safari to display a step-by-step *"Share → Add to Home Screen"* modal guide; automatically hides once running in `standalone` mode.
- **`OfflineIndicator.tsx`**: Listens to browser `online`/`offline` events and displays a floating pill when connectivity drops.

---

## 5. Security Architecture & Hardening

Nest implements defense-in-depth across `server/security/*` and `server/middleware/auth.ts`:

1. **Hashed `httpOnly` Session Cookies (`server/security/session.ts`, `tokens.ts`)**:
   - Sessions use 32-byte cryptographically random tokens (`crypto.randomBytes(32).toString('hex')`).
   - Only the **SHA-256 hash** (`hashToken`) is stored in `sessions.token` and `password_resets.token`—a database read leak never exposes live session cookies or password reset links.
   - Delivered exclusively via an `httpOnly` cookie (`kinfolk_session`, `SameSite=Lax` by default, `Secure` enforced in production/HTTPS) and **never** returned in JSON login/register bodies or stored in `localStorage` (legacy `kinfolk_auth_token` keys are actively purged on boot).
   - **14-day sliding TTL**: Active sessions automatically renew when `< 7 days` remain.
2. **Password Hardening & Timing-Safe Login (`server/security/passwords.ts`)**:
   - Hashed with `bcryptjs` at **cost factor `12`** (`BCRYPT_COST = 12`). Legacy hashes with lower cost rounds are transparently re-hashed and upgraded on next successful login (`needsRehash`).
   - Enforces minimum length (`5` chars), `72`-byte bcrypt UTF-8 ceiling, repeated-character rejection, common-password blocklist, and username-substring rejection.
   - Non-existent usernames still run `bcrypt.compare` against a precomputed `DUMMY_HASH` so response timing never leaks valid usernames.
3. **Multi-Dimensional Brute-Force & Rate Limiting (`server/middleware/auth.ts`, `rateLimit.ts`)**:
   - **Persistent Login Rate Limiter (`login_attempts` table, 15-minute window)**: Blocks after `5` failed attempts per `(ip, username)`, `20` failed attempts per `username` across all IPs (distributed credential stuffing), or `30` failed attempts per `ip` across all accounts (password spraying). Survives server restarts; entries older than 24h are pruned.
   - **Sliding-Window Endpoint Limiters**:
     - `POST /api/auth/register`: `10` req / hour per IP.
     - `POST /api/auth/redeem-reset`: `10` req / 15 min per IP.
     - Sensitive account mutations (`PATCH /api/auth/me`, `POST /api/auth/change-password`, `DELETE /api/auth/account`): `5` req / 15 min per user.
     - `POST /api/ai/*`: `30` req / 10 min per authenticated user (protects Gemini API billing).
4. **Re-Authentication & Session Rotation**:
   - Changing username, changing password, or deleting an account requires verifying `currentPassword`.
   - Changing or resetting a password revokes all existing sessions for that user across every device.
5. **Per-File Media Authorization & Upload Sandboxing (`server/security/media.ts`, `mediaAccess.ts`)**:
   - Every request to `/uploads/*`, `/api/storage/view`, and `/api/storage/file/:msgId/:fileName` passes through `requireMediaAccess`, verifying either a valid session with `canAccessStorageKey` / `canAccessTelegramMessage` permission **or** a constant-time verified HMAC view token (`STORAGE_SIGNING_SECRET`, required `≥ 32` chars in production).
   - Strict extension & MIME allowlist (`ALLOWED_MEDIA_EXTENSIONS`: photos `.jpg/.jpeg/.png/.webp/.gif/.heic/.heif/.avif/.bmp`, videos `.mp4/.m4v/.mov/.webm/.mkv/.3gp/.avi`, audio `.mp3/.m4a/.aac/.wav/.ogg/.oga/.opus/.flac`). Active content (`.html`, `.svg`, `.js`, `image/svg+xml`) is rejected at upload and static serving.
   - User media responses carry `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, `X-Content-Type-Options: nosniff`, and `Cross-Origin-Resource-Policy: same-origin` so uploaded files can never execute scripts.
6. **Strict CORS, Security Headers & Body Caps (`server/security/http.ts`)**:
   - Credentialed CORS is restricted to same-origin, `APP_URL`, and `ALLOWED_ORIGINS`. Cross-origin state-changing requests (`POST`/`PUT`/`PATCH`/`DELETE`) from unlisted origins are rejected outright with `403 Origin not allowed`.
   - Sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, `Cross-Origin-Opener-Policy: same-origin`, `X-Frame-Options: SAMEORIGIN` (unless `FRAME_ANCESTORS` is configured), and in production `Strict-Transport-Security` (`180` days + `includeSubDomains`) and full `Content-Security-Policy`.
   - Global JSON/urlencoded body limit is capped at **`1 MB`** (`25 MB` on `/api/ai` for authenticated users only).
   - Per-user storage quota enforcement (`USER_STORAGE_QUOTA_MB`, default `51,200 MB` / `50 GB`).

---

## 6. Complete Database Schema (20 Relational Tables)

Defined in `server/db.ts` (SQLite) and `server/neon.ts` (PostgreSQL), synced in topological order:

| # | Table | Primary Key | Key Columns & Purpose |
| :- | :--- | :--- | :--- |
| 1 | **`users`** | `id` (`TEXT`) | `username` (`UNIQUE`), `password_hash`, `display_name`, `role` (`admin`\|`member`\|`pending`), `status` (`active`\|`suspended`), `avatar_color`, `avatar_url`, `theme_preference` (`dark`\|`light`), `created_at` |
| 2 | **`groups`** | `id` (`TEXT`) | `name`, `description`, `creator_id` (`→ users`), `is_everyone` (`0`\|`1`), `created_at` |
| 3 | **`group_members`** | `(group_id, user_id)` | Composite membership join table with `joined_at` (`ON DELETE CASCADE`) |
| 4 | **`posts`** | `id` (`TEXT`) | `owner_id` (`→ users`), `caption`, `taken_at`, `uploaded_at`, `date_basis` (`taken_at`\|`uploaded_at`), `is_standalone`, `visibility_override` (`public_all`\|`hidden`\|`NULL`), `deleted_at` (soft-delete trash timestamp), `created_at` |
| 5 | **`post_files`** | `id` (`TEXT`) | `post_id` (`→ posts`), `storage_key`, `thumb_key`, `file_type` (`photo`\|`video`\|`audio`), `position`, `file_size`, `mime_type`, `width`, `height`, `checksum` (SHA-256), `tg_deleted_at` |
| 6 | **`albums`** | `id` (`TEXT`) | `title`, `description`, `creator_id` (`→ users`), `is_event` (`0`\|`1`), `event_date`, `event_place`, `cover_file_id`, `status` (`approved`\|`pending_approval`\|`rejected`), `deleted_at`, `created_at` |
| 7 | **`album_items`** | `(album_id, post_id)` | Links posts into albums/events with `position` and `added_at` |
| 8 | **`item_groups`** | `id` (`TEXT`) | Multi-circle placement table: `item_type` (`post`\|`album`), `item_id`, `group_id` (`→ groups`), `added_by` (`→ users`), `is_reference` (`0`\|`1`), `reference_status` (`approved`\|`pending_owner_approval`\|`rejected`), `added_at` (`UNIQUE(item_type, item_id, group_id)`) |
| 9 | **`comments`** | `id` (`TEXT`) | `target_type` (`post`\|`album`), `target_id`, `group_id` (`→ groups`), `author_id` (`→ users`), `parent_id` (nested replies), `text`, `edited_at`, `deleted_at`, `created_at` |
| 10 | **`reactions`** | `id` (`TEXT`) | `target_type`, `target_id`, `group_id` (`→ groups`), `user_id` (`→ users`), `emoji`, `created_at` (`UNIQUE(target_type, target_id, group_id, user_id, emoji)`) |
| 11 | **`mentions`** | `id` (`TEXT`) | `comment_id` (`→ comments`), `mentioned_user_id` (`→ users`), `created_at` |
| 12 | **`event_attendance`** | `(event_id, user_id)` | Tracks event attendees with optional `tagged_by` (`→ users`) and `created_at` |
| 13 | **`event_notes`** | `id` (`TEXT`) | Shared stories on events: `event_id` (`→ albums`), `author_id` (`→ users`), `text`, `visibility`, `is_anonymous` (`0`\|`1`), `created_at` |
| 14 | **`notifications`** | `id` (`TEXT`) | `user_id` (`→ users`), `type`, `title`, `body`, `link` (deep-link target), `read` (`0`\|`1`), `created_at` |
| 15 | **`reports`** | `id` (`TEXT`) | Member moderation flags: `reporter_id`, `target_type`, `target_id`, `reason`, `status` (`pending`\|`resolved`\|`dismissed`), `resolved_by`, `created_at` |
| 16 | **`audit_log`** | `id` (`TEXT`) | Admin action ledger: `actor_id`, `action`, `target_type`, `target_id`, `details`, `created_at` |
| 17 | **`ignored_duplicates`** | `id` (`TEXT`) | Remembers "Keep Both" choices: `user_id`, `match_key`, `created_at` (`UNIQUE(user_id, match_key)`) |
| 18 | **`sessions`** | `token` (`TEXT`) | SHA-256 hashed session token, `user_id` (`→ users`), `expires_at`, `created_at` |
| 19 | **`password_resets`** | `token` (`TEXT`) | SHA-256 hashed 1-hour single-use reset token, `user_id`, `created_by` (`→ users`), `expires_at`, `used_at`, `created_at` |
| 20 | **`login_attempts`** | `id` (`TEXT`) | Brute-force tracking: `ip`, `username`, `success` (`0`\|`1`), `attempted_at` |

**Database Indexes**: `idx_posts_owner`, `idx_posts_deleted_standalone`, `idx_post_files_post`, `idx_item_groups_lookup`, `idx_comments_target`, `idx_notifications_user`.

---

## 7. Complete REST API Reference

### System & Media Streaming (`server.ts`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Liveness check (`{ status: 'ok', timestamp }`). |
| `GET` | `/api/config` | Public | Environment flags (`{ isDeleteProtected, isRender }`). |
| `PUT` | `/api/storage/upload` | HMAC Upload Token | Direct raw binary upload endpoint for `LocalDiskStorageAdapter` (`?key=&token=&expires=`). |
| `GET` | `/api/storage/view` | Session or HMAC View Token | Universal media streamer (`?key=...`) supporting Telegram (`tg:`/`tgmsg:`), Local Disk, and S3/B2 with HTTP `206` byte-range support and disk caching. |
| `GET` | `/api/storage/file/:msgId/:fileName?` | Session (`canAccessTelegramMessage`) | Direct Telegram MTProto HTTP `206` range streaming endpoint with clean filenames for `<video>` scrubbing. |
| `GET` | `/uploads/*` | Session or HMAC View Token | Per-file authorized static serving for allowed media extensions with sandboxed headers. |

### Authentication & Account (`/api/auth`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public (Rate-limited) | Register new account (`username`, `password`, `displayName`). Sets `httpOnly` cookie. |
| `POST` | `/api/auth/login` | Public (Rate-limited) | Authenticate user, upgrade legacy bcrypt hashes if needed, set `kinfolk_session` cookie. |
| `GET` | `/api/auth/me` | Session | Return current authenticated user profile (including `avatarUrl` and `themePreference`). |
| `PATCH` | `/api/auth/me` | Session (`sensitiveLimiter`) | Update `displayName`, `username` (requires `currentPassword`), `avatarColor`, or `themePreference`. |
| `POST` | `/api/auth/avatar` | Session | Upload `PNG`/`JPEG`/`WebP` (`≤ 2 MB`) profile photo (`multipart/form-data` field `avatar`) or remove avatar (`remove: true` / empty). |
| `POST` | `/api/auth/change-password` | Session (`sensitiveLimiter`) | Verify `currentPassword`, set `newPassword`, rotate current session, and revoke all other sessions. |
| `POST` | `/api/auth/redeem-reset` | Public (`redeemLimiter`) | Redeem admin-issued 1-hour single-use `token` and set `newPassword`. |
| `POST` | `/api/auth/logout` | Session | Delete current session row and clear `kinfolk_session` cookie. |
| `POST` | `/api/auth/logout-all` | Session | Revoke all active sessions for the signed-in user across all devices. |
| `DELETE` | `/api/auth/account` | Session (`sensitiveLimiter`) | Verify `password` and permanently delete the user's account, sessions, memberships, and owned media. |

### Timeline Feed (`/api/feed`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/feed` | Approved Member | Cursor-paginated chronological stream combining `single_post` and `collection_card` items (`?groupId=&filter=all\|single\|collections&cursor=&limit=`). Automatically masks unapproved cross-circle references as locked placeholders. |

### Posts, Uploads & Duplicates (`/api/posts`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/posts/storage-capabilities` | Approved Member | Return active storage backend capabilities, max file size, dual-lane flags, and MTProto status. |
| `GET` | `/api/posts/upload-progress/:uploadId` | Approved Member | SSE stream emitting Phase-2 (`0–100%`) server-to-Telegram transfer progress. |
| `POST` | `/api/posts/upload-file` | Approved Member | Multipart upload (`file` + optional `thumb`, up to `2 GB`), enforces quota, computes SHA-256 checksum, and stores to Telegram / S3 / Local Disk. |
| `POST` | `/api/posts/signed-upload-urls` | Approved Member | Issue presigned upload URLs (also aliased at `POST /api/posts/presign-upload`). |
| `POST` | `/api/posts/sync-storage` | Approved Member | Reconcile storage keys and recover missing media records. |
| `POST` | `/api/posts` | Approved Member | Create post metadata record, attach `post_files`, and assign initial `item_groups` placements (and optional `albumId`). |
| `GET` | `/api/posts/:id` | Approved Member | Fetch single post detail with signed media URLs and placements (enforces `canUserViewPost`). |
| `PATCH` | `/api/posts/:id` | Owner or Admin | Update `caption`, `takenAt`, or `dateBasis`. |
| `POST` | `/api/posts/:id/caption` | Owner or Admin | Update post caption string. |
| `DELETE` | `/api/posts/:id` | Owner or Admin | Soft-delete post to Trash (`deleted_at`), or permanently delete (`permanent: true`) including storage cleanup. |
| `POST` | `/api/posts/:id/restore` | Owner or Admin | Restore a soft-deleted post from Trash (`deleted_at = NULL`). |
| `GET` | `/api/posts/trash/list` | Approved Member | List soft-deleted posts belonging to the current user (or all for admin). |
| `PUT` | `/api/posts/:id/files/:fileId` | Owner or Admin | Replace an existing post photo + thumbnail after cropping/rotating in `PhotoEditorModal`. |
| `POST` | `/api/posts/:id/files` | Owner or Admin | Append additional uploaded photos/videos to an existing post. |
| `DELETE` | `/api/posts/:id/files/:fileId` | Owner or Admin | Delete a single photo/video from a multi-file post (deletes post if it was the last file). |
| `POST` | `/api/posts/:id/convert-to-event` | Owner or Admin | Convert an existing post into an approved Event collection (`albums`) copying circle placements and marking creator present. |
| `POST` | `/api/posts/:id/override-visibility` | Admin | Set `visibility_override` (`'public_all'`, `'hidden'`, or `null`) and record audit log. |
| `POST` | `/api/posts/check-duplicates` | Approved Member | Check candidate `{ name, size, checksum }` files against existing vault media before uploading. |
| `GET` | `/api/posts/duplicates/list` | Approved Member | Scan library for duplicate file groups (excluding user's `ignored_duplicates`) and compute wasted bytes. |
| `POST` | `/api/posts/duplicates/keep-both` | Approved Member | Save `matchKey` in `ignored_duplicates` so both copies are kept without future alerts. |
| `POST` | `/api/posts/duplicates/resolve` | Approved Member | Keep chosen original file, optionally merge circle placements from duplicates, and remove duplicate files/posts. |

### Events & Curated Albums (`/api/albums`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/albums` | Approved Member | Create Event/Collection (`approved` immediately for admins; `pending_approval` proposal for members). |
| `GET` | `/api/albums` | Approved Member | List accessible albums and events. |
| `GET` | `/api/albums/:id` | Approved Member | Fetch album/event details, placements, and counts. |
| `GET` | `/api/albums/:id/items` | Approved Member | Paginated items inside an album (`?limit=60&offset=0`). |
| `POST` | `/api/albums/:id/items` | Approved Member | Add existing `postIds` into an album/event. |
| `GET` | `/api/albums/:id/attendance` | Approved Member | List attendees for an event. |
| `POST` | `/api/albums/:id/attendance` | Approved Member | Mark self or `targetUserId` as having attended the event. |
| `DELETE` | `/api/albums/:id/attendance/:targetUserId` | Self, Tagger, or Admin | Remove an attendance record. |
| `GET` | `/api/albums/:id/notes` | Approved Member | List event memory notes (masks author details when `is_anonymous = 1`). |
| `POST` | `/api/albums/:id/notes` | Approved Member | Add a public or anonymous memory note to an event. |
| `POST` | `/api/albums/:id/convert-to-event` | Creator or Admin | Convert a standard collection into a dated, location-tagged Event. |
| `DELETE` | `/api/albums/:id` | Creator or Admin | Soft-delete or permanently delete an album/event. |

### Circles / Groups (`/api/groups`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/groups` | Approved Member | List circles the user belongs to (or all circles for admins) with full member lists. |
| `GET` | `/api/groups/available-users` | Approved Member | List active approved members available to invite to circles or tag at events. |
| `POST` | `/api/groups` | Approved Member | Create a new circle (`name`, `description`, `memberIds`) and notify invited members. |
| `GET` | `/api/groups/:id` | Circle Member / Admin | Get circle details and member roster. |
| `PATCH` | `/api/groups/:id` | Creator or Admin | Update circle name or description. |
| `POST` | `/api/groups/:id/members` | Creator or Admin | Add a member (`userId`) to a circle. |
| `DELETE` | `/api/groups/:id/members/:targetUserId` | Self, Creator, or Admin | Leave a circle or remove a member (blocked on `Everyone` circle). |
| `DELETE` | `/api/groups/:id` | Creator or Admin | Delete a custom circle and clean up its memberships/placements (blocked on `Everyone` circle). |

### Placements & Reference Sharing (`/api/placements`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/placements/bunch` | Approved Member | Share one or more posts/albums into one or more circles (`approved` for owners/admins; `pending_owner_approval` reference request for non-owners). |
| `GET` | `/api/placements/pending-references` | Approved Member | List pending cross-circle reshare requests awaiting the current photo owner's decision. |
| `POST` | `/api/placements/pending-references/:placementId/decide` | Item Owner or Admin | Approve or reject (`decision: 'approved' \| 'rejected'`) a cross-circle reference request. |
| `GET` | `/api/placements/item/:itemType/:itemId` | Approved Member | Inspect current circle placements and `visibilityOverride` for a post or album. |
| `POST` | `/api/placements/adjust-permissions` | Owner or Admin | Synchronize exact `targetGroupIds` (and optional `visibilityOverride`) for a post or album. |
| `DELETE` | `/api/placements/:id` | Owner, Adder, or Admin | Remove a specific circle placement by placement ID. |
| `POST` | `/api/placements/remove-by-item` | Owner, Adder, or Admin | Remove a post/album from a specific `groupId`. |

### Comments, Reactions, Notifications, Reports & AI
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/comments` | Circle Member / Admin | List comments & replies for `(targetType, targetId, groupId)`. |
| `POST` | `/api/comments` | Circle Member / Admin | Post comment or nested reply (`parentId`), parse `@mentions`, and notify mentioned circle members. |
| `PATCH` | `/api/comments/:id` | Comment Author | Edit comment text (`edited_at` stamped). |
| `DELETE` | `/api/comments/:id` | Protected | Protected in preview (`403`) to preserve circle discussions. |
| `GET` | `/api/comments/group-members/:groupId` | Circle Member / Admin | Fetch active members of `groupId` for `@mention` autocomplete. |
| `POST` | `/api/reactions/toggle` | Circle Member / Admin | Toggle an emoji reaction on `(targetType, targetId, groupId)`. |
| `GET` | `/api/reactions` | Approved Member | Summarize emoji reaction counts, reactor names, and `userReacted` state for `(targetType, targetId, groupId)`. |
| `GET` | `/api/notifications` | Approved Member | Fetch latest notifications + `unreadCount`. |
| `POST` | `/api/notifications/mark-all-read` | Approved Member | Mark all notifications read for current user. |
| `POST` | `/api/notifications/:id/read` | Approved Member | Mark single notification read. |
| `POST` | `/api/reports` | Approved Member | Submit a moderation report (`targetType`, `targetId`, `reason`) and alert admins. |
| `POST` | `/api/ai/generate-caption` | Approved Member (`30/10m`) | Generate time-aware Gemini vision captions from uploaded `image`, `imageBase64`, or `storageKey` + `takenAt`/`tone`/`context`. |
| `POST` | `/api/ai/caption-post/:postId` | Owner or Admin (`30/10m`) | Analyze an existing post's lead photo + `taken_at` + circle name and return (or save) AI caption suggestions. |

### Admin Studio (`/api/admin` — Requires `admin` Role)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/admin/db-status` | Return Neon sync status, last sync timestamp, and `userCount` / `postCount`. |
| `POST` | `/api/admin/db-sync` | Push local database state to Neon PostgreSQL and repair post storage keys. |
| `POST` | `/api/admin/restore-turso` | Rebuild local SQLite cache cleanly from Neon PostgreSQL. |
| `POST` | `/api/admin/db-config` | Informational endpoint instructing admins to configure `DATABASE_URL` via environment variables. |
| `GET` | `/api/admin/storage-status` | Read-only storage diagnostics (`backend`, `mode`, `maxFileSizeLabel`, `telegramFileCount`, `legacyFileCount`—never exposes secrets). |
| `POST` | `/api/admin/storage-test` | Live connectivity test across Bot API, MTProto (embedded/external), and B2 fallback lanes. |
| `POST` | `/api/admin/telegram/check-deleted` | Trigger an immediate Telegram channel deletion scan and return `{ checked, newlyDeleted, restored, totalFlagged }`. |
| `POST` | `/api/admin/sync-storage` | Scan cloud bucket/disk for orphaned media files and restore them into the feed. |
| `POST` | `/api/admin/clear-feed` | Clear posts, albums, comments, and reactions while keeping user accounts and circles intact. |
| `POST` | `/api/admin/purge-all-data` | Full storage + content reset (preserves Telegram channel archive messages). |
| `GET` | `/api/admin/pending-signups` | List users with `role = 'pending'`. |
| `POST` | `/api/admin/approve-user/:id` | Approve pending signup (`role = 'member'`), add to `Everyone` circle, notify user, and log audit entry. |
| `POST` | `/api/admin/reject-user/:id` | Reject and remove pending signup. |
| `GET` | `/api/admin/users` | List all user accounts. |
| `POST` | `/api/admin/toggle-suspend/:id` | Suspend or reactivate a member account (revokes active sessions when suspending). |
| `DELETE` | `/api/admin/users/:id` | Permanently delete a user account and cascade cleanup across sessions, memberships, and media. |
| `POST` | `/api/admin/generate-reset-link/:id` | Issue a 1-hour single-use password reset URL and raw reset key for a locked-out user. |
| `GET` | `/api/admin/pending-proposals` | List member-proposed albums/events awaiting review. |
| `POST` | `/api/admin/proposals/:id/decide` | Approve or reject a proposed album/event and notify its creator. |
| `GET` | `/api/admin/reports` | List member-submitted moderation reports. |
| `POST` | `/api/admin/reports/:id/decide` | Resolve or dismiss a moderation report. |
| `GET` | `/api/admin/audit-log` | Retrieve latest 200 admin audit log entries joined with actor usernames. |

---

## 8. Repository Structure

```text
Memories-App/
├── server.ts                            # Express + Vite monolith entry point, media guards & streaming routes
├── index.html                           # Zero-flash theme bootstrap, Google Fonts & SPA root
├── vite.config.ts                       # Vite 6 + React + Tailwind v4 + VitePWA configuration
├── package.json                         # Scripts, runtime dependencies & dev tooling
├── tsconfig.json                        # TypeScript compiler configuration
├── .env.example                         # Complete template of supported environment variables
├── DESIGN_NOTES.md                      # Lumen Timeline visual design & UX specification
├── NEON_SETUP.md                        # Neon PostgreSQL persistence setup guide
├── SECURITY_FIXES.md                    # Security audit & hardening notes
├── public/
│   ├── icon.svg                         # Unified vector brand icon (tab, PWA, badges)
│   └── manifest.json                    # Web App Manifest for standalone installation
├── server/
│   ├── config.ts                        # Environment & PROTECT_DELETE detection
│   ├── db.ts                            # Local SQLite read cache, 20-table schema, migrations & Neon sync hooks
│   ├── neon.ts                          # Neon PostgreSQL pool, schema bootstrapper & SQLite->PG SQL translator
│   ├── seed.ts                          # Canonical Everyone group ID & no-op boot hook
│   ├── middleware/
│   │   └── auth.ts                      # Session verification, sliding renewal, role guards & login rate limit
│   ├── security/
│   │   ├── avatars.ts                   # Profile photo key -> /api/storage/view URL mapper
│   │   ├── http.ts                      # Strict CORS, CSP, HSTS & untrusted media response headers
│   │   ├── media.ts                     # Extension & MIME allowlists (blocks HTML/SVG/JS)
│   │   ├── mediaAccess.ts               # Per-file session & Telegram message authorization checks
│   │   ├── passwords.ts                 # Bcrypt cost-12 hashing, password validation & timing dummy hash
│   │   ├── rateLimit.ts                 # Dependency-free sliding-window rate limiter
│   │   ├── session.ts                   # Hashed session creation & httpOnly cookie helpers
│   │   └── tokens.ts                    # SHA-256 token hashing for sessions & password resets
│   ├── storage/
│   │   ├── index.ts                     # Storage adapter factory, capability probe & env auto-detection
│   │   ├── types.ts                     # StorageAdapter, capabilities & connection test interfaces
│   │   ├── telegram.ts                  # Dual-Lane Telegram adapter (Bot API + MTProto + 15 MB disk cache)
│   │   ├── telegram-mtproto.ts          # Embedded GramJS MTProto client (2 GB uploads, HTTP 206 streaming)
│   │   ├── hybrid.ts                    # HybridTelegramB2Adapter (Telegram writes + B2/S3 legacy reads)
│   │   ├── s3.ts                        # S3 / Backblaze B2 / Cloudflare R2 adapter with in-memory key index
│   │   ├── local.ts                     # LocalDiskStorageAdapter with constant-time HMAC signed URLs
│   │   ├── sync.ts                      # Bucket-to-DB recovery & key alignment repair
│   │   └── tg-deletion-sync.ts          # Periodic 5-min Telegram channel message deletion scanner
│   └── routes/
│       ├── auth.ts                      # Registration, login, profile, avatar, password & reset redemption
│       ├── feed.ts                      # Unified cursor-paginated timeline & locked placeholder builder
│       ├── posts.ts                     # Uploads, SSE progress, CRUD, photo edit, trash & duplicate cleaner
│       ├── albums.ts                    # Events & collections, pagination, attendance & anonymous notes
│       ├── groups.ts                    # Circles CRUD & membership management
│       ├── placements.ts                # Multi-circle bunch sharing, reference approvals & permissions
│       ├── comments.ts                  # Circle-scoped threaded comments & @mention notifications
│       ├── reactions.ts                 # Circle-scoped emoji reactions
│       ├── notifications.ts             # In-app notification inbox & read state
│       ├── ai.ts                        # Time-aware Gemini vision captioning & heuristic fallback
│       └── admin.ts                     # Admin Studio endpoints, reports router, DB/storage diagnostics
├── src/
│   ├── main.tsx                         # React 19 root mount
│   ├── App.tsx                          # Main shell, tab router, global drag-drop & modal orchestrator
│   ├── index.css                        # Lumen Timeline CSS custom properties, light/dark tokens & utilities
│   ├── context/
│   │   ├── AuthContext.tsx              # Cookie-backed auth state, retrying apiFetch & profile actions
│   │   └── ThemeContext.tsx             # Account + localStorage dual-layer light/dark theme manager
│   ├── lib/
│   │   └── format.ts                    # Relative dates, greetings, pluralization & deterministic colors
│   ├── types/
│   │   └── index.ts                     # Shared TypeScript interfaces (User, Group, FeedItem, etc.)
│   ├── utils/
│   │   ├── uploadWithProgress.ts        # Two-phase XHR (0-30%) + SSE (30-100%) upload client
│   │   └── videoThumbnail.ts            # Video/audio type detection & client-side JPEG frame extractor
│   └── components/
│       ├── ui/
│       │   ├── kit.tsx                  # Reusable Avatar, Badge, Modal, Dropdown, StatTile, PageHero, EmptyState
│       │   └── Feedback.tsx             # Global toast stack & promise-based confirm dialog provider
│       ├── Header.tsx                   # Top bar, search/palette trigger, notifications popover & user menu
│       ├── SideNav.tsx                  # Desktop left navigation & circle switcher rail
│       ├── BottomNav.tsx                # Mobile floating bottom navigation bar
│       ├── HeroRail.tsx                 # Greeting, archive counters & active circle summary card
│       ├── AuthScreen.tsx               # Sign-in, registration & password reset redemption screen
│       ├── PendingApprovalScreen.tsx    # Live-polling holding screen for unapproved signups
│       ├── TimelineFeed.tsx             # Chronological feed, multi-photo collages & inline actions
│       ├── FeedSearchBar.tsx            # Deferred text search, contributor/tag/date range filters
│       ├── UploadModal.tsx              # EXIF reader, 4K resizer, duplicate pre-check & multi-file uploader
│       ├── MediaViewerModal.tsx         # Gesture zoom/pan lightbox, grid overview & post tools
│       ├── PhotoEditorModal.tsx         # Interactive crop, aspect-ratio, rotate & flip canvas editor
│       ├── CaptionSuggestionsModal.tsx  # Gemini AI caption review, tone switcher & 1-click apply
│       ├── EventsPage.tsx               # Upcoming/past events & collections hub
│       ├── CollectionDetailModal.tsx    # 60-item paginated gallery, attendance roll & anonymous notes
│       ├── ProposeCollectionModal.tsx   # Event/collection creation & member proposal form
│       ├── AddPhotosToAlbumModal.tsx    # Upload new files or pick library posts for an event/post
│       ├── CirclesPage.tsx              # Privacy circles directory & search
│       ├── GroupManagementModal.tsx     # Create/edit circles & manage member rosters
│       ├── SharePlacementModal.tsx      # Multi-circle bunch sharing modal
│       ├── ViewingPermissionsModal.tsx  # Granular circle access & admin visibility override editor
│       ├── PendingReferencesBanner.tsx  # Inline Allow/Decline banner for photo owners
│       ├── LockedPlaceholder.tsx        # Privacy placeholder card for unapproved cross-circle references
│       ├── CommentsDrawer.tsx           # Slide-over circle thread, nested replies, @mentions & reactions
│       ├── DuplicateCleanerModal.tsx    # Vault duplicate scanner, placement merger & Keep Both manager
│       ├── TrashView.tsx                # 30-day soft-delete recovery & permanent purge page
│       ├── ProfilePage.tsx              # Avatar upload, handle/name/password/theme settings & account delete
│       ├── AdminPanel.tsx               # 6-tab Admin Studio + Neon DB & Storage connection diagnostics
│       ├── CommandPalette.tsx           # ⌘K / Ctrl+K keyboard command launcher
│       ├── PWAInstallButton.tsx         # Chromium/Android install prompt + iOS Add-to-Home-Screen guide
│       ├── TgDeletedBadge.tsx           # "Deleted from TG" status badge overlay
│       ├── OfflineIndicator.tsx         # Real-time network offline banner
│       ├── ErrorBoundary.tsx            # Graceful React crash recovery boundary
│       ├── Icons.tsx                    # Custom SVG reaction/UI icons
│       └── Illustrations.tsx            # Vector onboarding & empty-state artwork
├── scripts/
│   ├── generate-telegram-session.ts     # Interactive CLI to generate a GramJS TELEGRAM_SESSION string
│   ├── import-from-turso.ts             # One-time migration utility from legacy Turso/libSQL to Neon
│   ├── purge-storage.ts                 # CLI reset tool for storage objects and media tables
│   └── seed.ts                          # Disabled placeholder (production never seeds fake data)
└── tests/
    └── run_tests.ts                     # 13-suite end-to-end security, privacy & API integration test runner
```

---

## 9. Environment Variables Reference

Copy `.env.example` to `.env` for local development or configure these in your hosting dashboard:

### Core & Database
| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `3000` | HTTP port bound by Express (`0.0.0.0`). |
| `NODE_ENV` | No | `development` | Set to `production` in cloud deployments (enables static `dist/` serving, HSTS, CSP, secure cookies, and mandatory `STORAGE_SIGNING_SECRET`). |
| `APP_URL` | Recommended | Request host | Canonical public HTTPS origin (e.g. `https://nest.example.com`) used for CORS allowlisting and password-reset URLs. |
| `DATABASE_URL` | **Required in Prod** | Unset (local SQLite only) | Neon PostgreSQL connection string (`postgresql://...?sslmode=require`). Aliases `NEON_DATABASE_URL` and `POSTGRES_URL` are also recognized. |
| `DATA_DIR` / `DB_PATH` | No | `./data/kinfolk.sqlite` | Custom directory or file path for the local SQLite read-cache file. |
| `GEMINI_API_KEY` | Optional | Unset (uses heuristic fallback) | Google Gemini API key read by `@google/genai` for vision-based time-aware caption generation. |

### Security & Access Control
| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `STORAGE_SIGNING_SECRET` | **Required in Prod** | Random ephemeral in dev | Secret key (`≥ 32` characters, e.g. `openssl rand -hex 32`) used to sign and verify local media HMAC URLs. Server refuses to boot in `production` without it. |
| `BOOTSTRAP_ADMIN_USERNAME` | Recommended | Any first user in dev | On an empty database in production, **only** this exact username is promoted to `admin` upon first registration. |
| `ALLOWED_ORIGINS` | No | `""` | Comma-separated extra origins permitted to make credentialed cross-origin API calls. |
| `COOKIE_SAMESITE` | No | `lax` | Session cookie `SameSite` policy (`lax`, `strict`, or `none`). |
| `FRAME_ANCESTORS` | No | `""` | Comma-separated origins allowed to embed Nest in an `<iframe>`. When empty, `X-Frame-Options: SAMEORIGIN` is enforced. (Set `FRAME_ANCESTORS=*` when previewing inside cloud IDE iframes.) |
| `TRUST_PROXY` | No | `1` in prod | Number of reverse-proxy hops trusted by Express for client IP resolution (`req.ip`). |
| `USER_STORAGE_QUOTA_MB` | No | `51200` (`50 GB`) | Per-user cumulative upload quota in megabytes (`0` disables quota enforcement). |
| `PROTECT_DELETE` | No | `false` | Set to `true` to block destructive delete/purge endpoints on public preview deployments. |

### Storage Backend: Telegram Dual-Lane & S3 / Backblaze B2
| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `STORAGE_BACKEND` | No | Auto-detected | `'telegram'` \| `'b2'` \| `'r2'` \| `'s3'` \| `'local'`. Auto-selects Telegram if Telegram credentials are present, else S3/B2 if configured, else `local`. |
| `TELEGRAM_CHAT_ID` | For Telegram | `""` | Target private Telegram channel ID (typically `-100xxxxxxxxxx`; alias `CHANNEL_ID`). |
| `TELEGRAM_BOT_TOKEN` | Lane 1 (Bot API) | `""` | Bot token from `@BotFather` (admin in channel) for fast uploads `≤ 15 MB`. |
| `TELEGRAM_API_BASE_URL` | Optional | `https://api.telegram.org` | Self-hosted Telegram Bot API Server URL (lifts Bot API file limit to `2 GB`). |
| `TELEGRAM_API_ID` | Lane 2 (MTProto) | `""` | Numeric Telegram API ID from `https://my.telegram.org` (alias `API_ID`). |
| `TELEGRAM_API_HASH` | Lane 2 (MTProto) | `""` | Telegram API Hash from `https://my.telegram.org` (alias `API_HASH`). |
| `TELEGRAM_SESSION` | Lane 2 (Embedded) | `""` | GramJS `StringSession` generated via `npm run telegram:session` (aliases `TELEGRAM_STRING_SESSION`, `STRING_SESSION`). |
| `TELEGRAM_MTPROTO_SERVER_URL` | Lane 2 (External) | `""` | Optional URL of an external standalone NotaForge `telegram-server` (if not using embedded `TELEGRAM_SESSION`). |
| `TELEGRAM_DELETE_CHECK_MINUTES` | No | `5` | Interval in minutes for polling Telegram channel message deletions (`0` disables). |
| `TELEGRAM_DELETE_CHECK_BOT_BATCH` | No | `60` | Number of Bot API messages probed per deletion-scan cycle. |
| `S3_ENDPOINT` / `B2_ENDPOINT` | For S3/B2/R2 | AWS default | S3-compatible endpoint (e.g. `s3.us-west-004.backblazeb2.com` or `<accountid>.r2.cloudflarestorage.com`). |
| `S3_REGION` / `B2_REGION` | No | Auto-extracted | Bucket region (`auto` or explicit region; automatically parsed from Backblaze B2 endpoints). |
| `S3_BUCKET` / `B2_BUCKET` | For S3/B2/R2 | `""` | Bucket name (alias `B2_BUCKET_NAME`). |
| `S3_ACCESS_KEY_ID` / `B2_KEY_ID` | For S3/B2/R2 | `""` | Access Key ID (aliases `B2_ACCESS_KEY_ID`, `B2_APPLICATION_KEY_ID`). |
| `S3_SECRET_ACCESS_KEY` / `B2_APPLICATION_KEY` | For S3/B2/R2 | `""` | Secret Access Key (alias `B2_SECRET_ACCESS_KEY`). |
| `S3_PUBLIC_URL` / `B2_PUBLIC_URL` | Optional | `""` | Optional custom CDN domain for public bucket reads. |

---

## 10. Local Development & Setup Guide

### Prerequisites
- **Node.js `20+`** and **npm**

### Quick Start (Zero External Services Needed)
Out of the box, Nest runs with local SQLite (`./data/kinfolk.sqlite`), local HMAC-signed disk storage (`./uploads`), and offline heuristic AI captions:

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template (optional for local dev)
cp .env.example .env

# 3. Start the Express + Vite development server on http://localhost:3000
npm run dev
```

1. Open **`http://localhost:3000`** in your browser.
2. Click **Create account**—in local development (`NODE_ENV !== 'production'`), the very first user registered on an empty database automatically becomes **`admin`** and creates the **`Everyone`** circle.
3. Subsequent accounts registered in another browser/incognito window start as **`pending`** and appear immediately under **Admin Studio → Signups** for 1-click approval.

> **Running inside a cloud IDE / iframe preview?** Start the dev server with `FRAME_ANCESTORS='*' npm run dev` so `server/security/http.ts` permits iframe embedding.

---

## 11. Cloud Storage Setup Guides

### 11.1 Telegram Dual-Lane Setup (Bot API + GramJS MTProto)
Configuring both lanes gives you instant Bot API uploads for everyday photos (`≤ 15 MB`) and 8-worker MTProto uploads + HTTP `206` video scrubbing up to **`2 GB`** per file:

1. **Create a Private Telegram Channel**:
   - Create a new **Private Channel** in Telegram (e.g. `Nest Media Vault`).
   - Forward any message from the channel to `@userinfobot` or inspect the channel link to get its numeric ID starting with **`-100...`** → set as `TELEGRAM_CHAT_ID`.
2. **Configure Lane 1 (Bot API)**:
   - Message `@BotFather` → `/newbot` → copy the token → set as `TELEGRAM_BOT_TOKEN`.
   - Add your bot to the private channel as an **Administrator** with *Post Messages*, *Edit Messages*, and *Delete Messages* permissions.
3. **Configure Lane 2 (Embedded MTProto — 2 GB Support)**:
   - Visit **`https://my.telegram.org`** → **API development tools** → copy `api_id` and `api_hash`.
   - Ensure the Telegram user account is an **Administrator** in the same private channel.
   - Generate your encrypted `StringSession` locally:
     ```bash
     TELEGRAM_API_ID=12345678 TELEGRAM_API_HASH=your_api_hash npm run telegram:session
     ```
   - Enter your phone number, OTP code, and 2FA password when prompted, then copy the printed string into `TELEGRAM_SESSION`.
4. **Verify**: Sign in as admin → **Admin Studio → Storage Status → Test Connection** to confirm both Bot API and MTProto lanes report green (`Connected`).

### 11.2 Backblaze B2 / Cloudflare R2 / AWS S3 Setup
- **Standalone S3/B2 Mode**: Set `STORAGE_BACKEND="b2"` (or `"r2"` / `"s3"`) along with `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. Ensure your bucket CORS rules allow `GET`, `PUT`, and `HEAD` from your `APP_URL` if using presigned browser uploads.
- **Hybrid Mode (Recommended when migrating from B2 to Telegram)**: Set `STORAGE_BACKEND="telegram"` while keeping your `S3_*` / `B2_*` variables in place. All new uploads go to Telegram at zero storage cost while every historical `posts/...` key continues streaming seamlessly from Backblaze B2.

---

## 12. Production Deployment (Render + Neon PostgreSQL)

1. **Provision Neon PostgreSQL (`NEON_SETUP.md`)**:
   - Create a free project at [neon.tech](https://neon.tech) and copy the connection string (`postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`).
   - No manual SQL migrations are needed—Nest creates all 20 tables and indexes automatically on boot.
2. **Create a Render Web Service**:
   - Connect this GitHub repository on [render.com](https://render.com).
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
3. **Configure Production Environment Variables**:
   - `NODE_ENV` = `production`
   - `APP_URL` = `https://your-service-name.onrender.com` (or custom domain)
   - `DATABASE_URL` = `postgresql://...?sslmode=require`
   - `STORAGE_SIGNING_SECRET` = `<64-char hex secret from: openssl rand -hex 32>`
   - `BOOTSTRAP_ADMIN_USERNAME` = `<your_admin_username>`
   - `STORAGE_BACKEND` = `telegram` + `TELEGRAM_CHAT_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`
   - `GEMINI_API_KEY` = `<optional_google_ai_key>`
4. **Deploy & Claim Admin**:
   - Once live, register with the exact username specified in `BOOTSTRAP_ADMIN_USERNAME` to claim the initial `admin` seat.

---

## 13. CLI Operational Scripts & Automated Test Suite

| Command | Script / Target | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `tsx server.ts` | Start full-stack Express + Vite HMR development server on port `3000`. |
| `npm run build` | `vite build` | Compile optimized production React + PWA bundle into `dist/`. |
| `npm start` | `NODE_ENV=production tsx server.ts` | Run production server serving `dist/` and all `/api/*` endpoints. |
| `npm run lint` | `tsc --noEmit` | Run full TypeScript static type-checking across frontend and backend. |
| `npm test` | `tsx tests/run_tests.ts` | Launch an isolated sandbox server (`data/test_sandbox.sqlite`) and run all **13 end-to-end integration & security test suites**. |
| `npm run telegram:session` | `scripts/generate-telegram-session.ts` | Interactive CLI wizard to authenticate with Telegram and output `TELEGRAM_SESSION`. |
| `npm run import:turso` | `scripts/import-from-turso.ts` | Idempotent one-time importer that copies all 20 tables from a legacy Turso (`libsql://`) database into Neon PostgreSQL. |
| `npm run purge` | `scripts/purge-storage.ts` | CLI reset tool that purges bucket/disk objects and clears media/post/album rows. |

### What `npm test` Verifies (`tests/run_tests.ts`)
1. **Pending Isolation**: Pending signups (`role = 'pending'`) receive `403` across `/api/feed`, `/api/groups`, `/api/albums`, and media endpoints.
2. **Private Vault Isolation**: Standalone posts with zero circle placements are strictly invisible to other approved members.
3. **Owner-Gated Reference Locking**: Cross-circle reshares render as `isLockedPlaceholder: true` with zero exposed file URLs until the photo owner approves the reference.
4. **Circle-Scoped Comment Isolation**: Comments posted on a shared photo inside Circle A never appear when viewing the same photo inside Circle B.
5. **Passwordless Switch-User Removal**: Verifies legacy `/api/auth/switch-user` backdoor endpoints remain `404`.
6. **Media Authentication Guard**: Unauthenticated requests to `/uploads/*`, `/api/storage/view`, and `/api/storage/file/*` are rejected (`401`).
7. **Cookie-Only Session Secrecy**: Login sets `httpOnly` `kinfolk_session` cookie and never leaks session tokens in JSON response bodies.
8. **CORS & Security Headers**: Validates `X-Content-Type-Options: nosniff`, `X-Frame-Options`, and `403` rejection of unknown cross-origin `POST` requests.
9. **Upload Extension & MIME Hardening**: Confirms `.html`, `.svg`, and script payloads are rejected while valid images succeed.
10. **Per-File Authorization & Body Limits**: Ensures Member A cannot fetch Member B's private file key via `/api/storage/view` (`403`) and oversized JSON payloads (`> 1 MB`) are rejected (`413`).
11. **Password Policy, Re-Auth & Brute-Force Lockout**: Tests minimum length/weak password rejection, password re-verification on `DELETE /api/auth/account`, and `429` lockout after 5 failed logins.
12. **Profile Photo Lifecycle**: End-to-end upload, replacement, feed/comment avatar resolution, and removal back to initials.
13. **Admin Reset Links & Telegram Avatar Access**: Tests 1-hour admin reset key generation, full URL redemption, password rotation, and member access to Telegram-backed avatar keys (`tg:...`).
