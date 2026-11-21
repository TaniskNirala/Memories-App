# Neon database setup (Render)

Your photos/videos live in Telegram, but the *list* of posts (which photo belongs to which
memory, who can see it, captions, comments, circles, users, login sessions) lives in the app's
database. That database is now **Neon PostgreSQL**, so it survives restarts, redeploys, hard
refreshes and logins from any new device.

## How it works

- Neon is the permanent copy. The app keeps a fast local SQLite cache for reads.
- Every write (new post, comment, login, delete ...) is saved to the cache **and** to Neon, in order.
- The server only answers a write request **after** Neon has confirmed it, so "upload finished"
  really means "saved forever".
- On every boot the app creates any missing tables in Neon automatically, then rebuilds its cache
  from Neon. Delete the Render disk, redeploy, restart: everything comes back.
- If `DATABASE_URL` is set but Neon cannot be reached, the app refuses to start (and logs why)
  instead of running with an empty database.

## 1. Create the Neon database

1. https://neon.tech -> create a project (free plan is fine).
2. Open the project -> **Connect** -> copy the **Connection string**. It looks like
   `postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`

## 2. Render environment variables

**Add**

| Key | Value |
| --- | --- |
| `DATABASE_URL` | the Neon connection string from step 1 |

**Remove** (no longer used)

| Key | Why |
| --- | --- |
| `TURSO_DATABASE_URL` | Turso is replaced by Neon |
| `TURSO_AUTH_TOKEN` | Turso is replaced by Neon |
| `DB_PATH` | only if you set it - the local file is just a cache now |
| `DATA_DIR` | only if you set it - same reason |

**Keep exactly as they are**

`STORAGE_BACKEND=telegram`, `TELEGRAM_CHAT_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_API_ID`,
`TELEGRAM_API_HASH`, `TELEGRAM_SESSION`, `GEMINI_API_KEY`, `APP_URL`, `NODE_ENV=production`,
and the `S3_*` / `B2_*` variables if you still have old files there.

You do **not** need a Render persistent disk any more.

## 3. Deploy

Push / upload this version and deploy. In the Render logs you should see:

```
🔌 [Neon] Connecting to postgres://ep-xxxx.../neondb ...
🗄️  [Neon] Schema ready (20 tables verified/created)
```

On the very first deploy Neon is empty, so the app copies the account(s) found in the bundled
`data/kinfolk.sqlite` (your admin user `tanisk` and the "Everyone" circle) into Neon:

```
🚚 [Neon] Neon is empty - migrating 1 existing local user(s) ...
```

From the second boot on you will see `📥 [Neon] Restored N row(s) from Neon`.
After the first successful deploy you can delete `data/kinfolk.sqlite` from your repo.

## 4. Check it works

1. Log in, upload a photo and a video.
2. Hard refresh (Ctrl+Shift+R) -> still there.
3. Render dashboard -> **Manual Deploy -> Restart** (or redeploy) -> still there.
4. Log in from another device/browser -> still there.
5. Admin panel -> click the database badge -> "Neon Database Status" shows connected, with your user/memory counts.

## Optional: bring over old Turso data

If your old Turso database still has users, circles or albums you want:

```
TURSO_DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." DATABASE_URL="postgresql://..." npm run import:turso
```

Safe to run more than once.

## Old uploads that are already in Telegram

Files that were uploaded before this change are still in your Telegram channel, but the app lost
the records that pointed to them (the storage key `tg:...` / `tgmsg:...` was only in the lost
database). Those cannot be re-linked automatically from the app as it is today. Everything you upload from now on is
recorded permanently.
