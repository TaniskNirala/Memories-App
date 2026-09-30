# Kinfolk Memories 🌿

A private, zero-quota memory and photo sharing web app engineered for 6 to 10 close friends. Designed for free hosting on Render (with ephemeral disk) using Supabase/Neon PostgreSQL and Cloudflare R2 / S3-compatible object storage, while running seamlessly offline or locally with pure SQLite and local-disk storage.

---

## 1. Architecture Summary

### Storage Strategy
- **Zero Local Disk Dependency in Production**: Media files upload directly from the browser to Cloudflare R2 / AWS S3 using presigned upload URLs generated on demand. Viewing files uses short-lived presigned URLs.
- **Local Development Adapter**: Implements the identical `StorageAdapter` interface with HMAC-SHA256 signed upload and view tokens. Files stream directly to `./uploads/` with zero external cloud accounts needed.
- **No Storage Limits or Quotas**: The system sets no arbitrary caps on photo resolution, video clips, or total upload sizes.

### Data & Permissions Model
- **Placements (`item_groups`)**: A post or album is stored once in the database and referenced across multiple circles via `item_groups (item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)`.
- **Referencing & Locked Placeholders**: When a member references someone else's memory into another circle, friends in that circle who could not already see the original receive a locked placeholder card until the owner explicitly approves the reference request.
- **Group-Isolated Conversations**: Threaded comments and emoji reactions are strictly scoped to a post's placement within a specific group (`comments.group_id`, `reactions.group_id`). A conversation in a group of two remains completely isolated from other circles sharing the same photo.
- **Strict Role-Based Access Control**:
  - `admin`: Manages user approval, suspends accounts, issues one-time reset links, reviews content reports, overrides item visibility (with mandatory audit logging), approves album proposals.
  - `member`: Creates circles, uploads memories, comments, reacts, proposes albums.
  - `pending`: Newly registered accounts. Cannot see any feeds, circles, or media until an admin approves them (auto-added to "Everyone").
  - `suspended`: Blocked from session verification and all API routes.

---

## 2. File Tree

```
├── .env.example
├── index.html
├── metadata.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── server.ts                       # Express + Vite SSR/Middleware server entry point
├── server/
│   ├── db.ts                       # Relational SQLite database engine (sql.js) & schema
│   ├── seed.ts                     # Database seed generator (admin, 3 members, sample circles, events)
│   ├── middleware/
│   │   └── auth.ts                 # httpOnly cookie session parser, rate limiter, role guards
│   ├── routes/
│   │   ├── admin.ts                # Signups, user directory, one-time reset links, reports, audit log
│   │   ├── albums.ts               # Collections, lazy-loaded photo grid (60/page), attendance & notes
│   │   ├── auth.ts                 # Registration, login, session cookies, rate limiting, reset redemption
│   │   ├── comments.ts             # Threaded comments per placement, @mention autocomplete, edit & soft-delete
│   │   ├── feed.ts                 # Mixed feed (single posts + collection cards), cursor pagination, recent strip
│   │   ├── groups.ts               # "Everyone" circle + private circles, member management
│   │   ├── notifications.ts        # Mentions, reference requests, event tags, admin overrides
│   │   ├── placements.ts           # Bunch sharing, cross-circle references, owner approval workflows
│   │   ├── posts.ts                # Signed upload URLs, post lifecycle, trash vs purge, visibility overrides
│   │   └── reactions.ts            # Emoji reactions scoped to group placement
│   └── storage/
│       ├── types.ts                # Unified StorageAdapter interface
│       ├── local.ts                # Local disk HMAC-signed URL storage adapter
│       ├── s3.ts                   # AWS S3 / Cloudflare R2 presigned URL storage adapter
│       └── index.ts                # Storage backend factory
├── scripts/
│   └── seed.ts                     # Standalone CLI database seed runner
├── tests/
│   └── run_tests.ts                # Automated permission & isolation test suite
└── src/
    ├── App.tsx                     # Main application component & tab orchestrator
    ├── index.css                   # Unified CSS variables for dark indigo & playful cream themes
    ├── main.tsx                    # React client entry point
    ├── context/
    │   ├── AuthContext.tsx         # User authentication, roles, session management
    │   └── ThemeContext.tsx        # Dark/Light mode toggle with persistence
    ├── types/
    │   └── index.ts                # Shared TypeScript type definitions
    └── components/
        ├── AdminPanel.tsx          # User approvals, suspensions, reset links, audit log
        ├── AuthScreen.tsx          # Login, signup, password reset redemption
        ├── BottomNav.tsx           # Thumb-zone mobile navigation (Feed, Albums, Upload, Circles, Admin)
        ├── CollectionDetailModal.tsx # 60-at-a-time grid, "I was there" attendance, event notes
        ├── CommentsDrawer.tsx      # Threaded comments per placement, @mentions autocomplete
        ├── FeedItemCard.tsx        # Single post cards & cover mosaic collection cards
        ├── GroupManagementModal.tsx# Circle creation, friend invitations, member management
        ├── Header.tsx              # Top bar, notifications dropdown, brand wordmark
        ├── LockedPlaceholder.tsx   # Anti-leak card for pending photo references
        ├── MediaViewerModal.tsx    # High-resolution lightbox, delete options, admin overrides
        ├── OfflineIndicator.tsx    # PWA offline status banner
        ├── PendingApprovalScreen.tsx # Friendly waiting room for pending users
        ├── PendingReferencesBanner.tsx # Owner action banner for reference approval requests
        ├── ProposeCollectionModal.tsx # Member proposal form for albums & events
        ├── PWAInstallButton.tsx    # Web App install prompt & iOS Safari instructions
        ├── SharePlacementModal.tsx # Bunch sharing & circle reference modal
        ├── TrashView.tsx           # 30-day soft-delete trash recovery and purge
        └── vite-env.d.ts
```

---

## 3. Quick Start (Local One-Command Run)

No cloud account is required for local execution.

### Prerequisites
- Node.js 18+

### Setup & Run
```bash
# 1. Install dependencies
npm install

# 2. Run the full-stack server (Vite + Express on port 3000)
npm run dev
```

Visit `http://localhost:3000` in your browser. The SQLite database is automatically seeded on first launch with sample friends, photos, circles, and comments.

To re-seed the database at any time:
```bash
npm run seed
```

To run the automated security & permissions test suite:
```bash
npm run test
```

---

## 4. Default Seed Credentials

| Username | Password | Role | Display Name | Circles |
| :--- | :--- | :--- | :--- | :--- |
| `admin` | `admin123` | **admin** | Jordan Admin | Everyone, Weekend Hikers |
| `maya` | `secret123` | **member** | Maya Lin | Everyone, Weekend Hikers, Recipe Club |
| `leo` | `secret123` | **member** | Leo Torres | Everyone, Weekend Hikers |
| `sam` | `secret123` | **member** | Sam Rivera | Everyone, Recipe Club |
| `elena` | `secret123` | **pending** | Elena Rostova | *(None - pending admin approval)* |

---

## 5. Environment Variables (`.env`)

```ini
# Server Port (default 3000)
PORT=3000
NODE_ENV=production

# Storage Backend: 'local' (default) or 's3' (for Cloudflare R2 / AWS S3)
STORAGE_BACKEND=local
STORAGE_SIGNING_SECRET=generate-a-random-32-character-secret-key-here

# Cloudflare R2 / S3 Configuration (only needed if STORAGE_BACKEND=s3)
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=kinfolk-media
S3_ACCESS_KEY_ID=<your-r2-access-key-id>
S3_SECRET_ACCESS_KEY=<your-r2-secret-access-key>
S3_PUBLIC_URL=https://media.yourdomain.com
```

---

## 6. Render Deployment Guide (Free Web Tier)

Render's free tier provides an ephemeral disk and puts idle services to sleep after 15 minutes. Here is how to configure Kinfolk for production:

1. **Database**:
   - Create a free Postgres instance on [Neon](https://neon.tech) or [Supabase](https://supabase.com).
   - Set the connection string in your Render service environment.

2. **Storage**:
   - Create a free bucket on [Cloudflare R2](https://developers.cloudflare.com/r2/) (10 GB free storage, zero egress fees).
   - Generate an S3 API token in Cloudflare Dashboard: **R2 > Manage R2 API Tokens > Create Token** with Object Read & Write permissions.
   - Configure custom domain on the bucket (e.g., `media.yourdomain.com`).

3. **Render Web Service Settings**:
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Environment Variables**:
     ```ini
     NODE_ENV=production
     STORAGE_BACKEND=s3
     S3_ENDPOINT=https://<your-cf-account-id>.r2.cloudflarestorage.com
     S3_REGION=auto
     S3_BUCKET=kinfolk-media
     S3_ACCESS_KEY_ID=<your-r2-key-id>
     S3_SECRET_ACCESS_KEY=<your-r2-secret-key>
     S3_PUBLIC_URL=https://media.yourdomain.com
     ```

---

## 7. Python FastAPI Architectural Alignment

The backend was built in TypeScript/Express to run natively inside the AI Studio container while matching the identical Python FastAPI patterns:
- Express routers match FastAPI `APIRouter` structure (`/api/auth`, `/api/groups`, `/api/posts`, `/api/comments`, etc.).
- `requireApproved` and `requireAdmin` middlewares match FastAPI `Depends(get_current_approved_user)` and `Depends(get_current_admin)`.
- Storage adapter abstraction matches Python's `Protocol` / `ABC` interface for interchangeable S3 and local storage backends.
- Argon2 / Bcrypt password hashing and httpOnly cookie sessions match Starlette / FastAPI cookie security.

---

## 8. Automated Tests & Invariants Verified

Run the test suite:
```bash
npm run test
```

### Verified Test Cases:
1. **Pending Users See Nothing**: Elena's pending account is forbidden from accessing the stream and circles (HTTP 403 Forbidden with `isPending` flag).
2. **Private Posts Invisibility**: Sam's private sourdough loaf photo (no circle placements) returns 404 to Maya and is omitted from her feed, but remains visible to Sam.
3. **Reference Locked Placeholders**: When Leo references Maya's hiking photo into Recipe Club, Sam (who is not in Weekend Hikers) sees a locked placeholder card until Maya approves it.
4. **Group Conversation Isolation**: Comments and emoji reactions on a photo placed in Weekend Hikers are not queryable from Recipe Club or accessible to users outside Weekend Hikers.

---

## 9. Assumptions & Trade-Offs

1. **Single Express + Vite Monolith**: To deliver a 1-command startup without external servers, Vite dev middleware is mounted directly on Express in development mode.
2. **Local Direct Upload Protocol**: For local mode, direct browser PUT requests are handled by an authenticated Express endpoint with HMAC signatures that mirror Cloudflare R2's S3 presigned PUT URLs.
3. **No Direct Messages (DMs)**: True to the brief, peer-to-peer sharing is modeled as a private group of two.
4. **Photo Compression**: Photos are downscaled to 2048px on the longest side using the browser's HTML5 Canvas API before direct storage upload, preserving quality while minimizing bandwidth.
