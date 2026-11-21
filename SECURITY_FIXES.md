# Security fixes (second pass)

| # | Finding | Fix |
|---|---|---|
| 1 | Passwordless `/switch-user` | Removed (previous pass) |
| 2 | Public media | Media needs a session **and** per-file permission (owner, admin, or a viewer of a post containing the file), or a valid signed token. Fuzzy filename lookup only matches the same upload. |
| 3 | Upload / stored XSS | `STORAGE_SIGNING_SECRET` is mandatory in production (random temp secret in dev). Only photo/video/audio extensions and MIME types are accepted or signed; html/svg/js are refused. Uploads are served with `nosniff`, a sandbox CSP and `Content-Disposition: inline`. |
| 4 | CORS / CSRF | Allow-list CORS (same origin, `APP_URL`, `ALLOWED_ORIGINS`); cross-site writes from unknown origins are refused; cookie is `SameSite=Lax` (`COOKIE_SAMESITE` to override). |
| 5 | Brute force | Login lockout (5 fails per IP+user / 15 min, plus per-IP and per-user caps), persisted across restarts; register and reset-redeem limiters; constant-time login for unknown users. |
| 6 | Passwords | Min 10 chars + common/username checks, bcrypt cost 12 (old hashes upgraded on login), change-password endpoint + UI, account deletion needs the password. |
| 7 | First visitor = admin | First admin only via `BOOTSTRAP_ADMIN_USERNAME` in production. |
| 8 | Sessions | Tokens stored as SHA-256 hashes; httpOnly cookie only (no token in JSON/localStorage); 14-day sliding expiry; "Sign out everywhere". |
| 9 | Headers / limits | helmet-style headers, HSTS + CSP in production, `X-Powered-By` removed, JSON/form bodies 1 MB (25 MB only for signed-in `/api/ai`), upload count limits, per-user storage quota. |
| M | Bundled DB | `data/kinfolk.sqlite` removed from the project; NEON_SETUP.md updated. |
| M | Reset link host | Built from `APP_URL` when set. |
| M | Reset tokens | Stored hashed; link uses `#token=` fragment (never sent to servers/logs). |
| M | Directory creation on read | `getFilePath` is now pure; only writes create folders; traversal guard uses resolve + containment. |
| M | Raw `err.message` | Generic messages to clients, details logged server-side. |
| M | AI route | 30 requests / 10 min per user. |
| M | Boot warning | Server refuses to start in production without a valid `STORAGE_SIGNING_SECRET`. |

Known limitation: registration still says "username already taken" (needed for the sign-up UX); it is rate limited.
