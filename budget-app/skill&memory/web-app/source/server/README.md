# Private ledger cloud service

The Vercel deployment uses Sign in with Vercel for identity and a **private** Blob store for data. The GitHub Pages build remains a local-only client. No ledger, OAuth secret, session secret, or storage token belongs in the source tree or a `VITE_*` variable.

## Server configuration

Set these variables on the production Vercel project:

| Variable | Value |
| --- | --- |
| `BUDGET_APP_ORIGIN` | Exact HTTPS origin, with no path or trailing slash |
| `VERCEL_APP_CLIENT_ID` | Sign in with Vercel app client ID |
| `VERCEL_APP_TOKEN_AUTH_METHOD` | `client_secret_post` (default), or explicitly `none` for a public client with PKCE |
| `VERCEL_APP_CLIENT_SECRET` | Required in `client_secret_post` mode; omitted in explicitly configured `none` mode |
| `BUDGET_OWNER_VERCEL_ID` | The owner's Vercel **user** ID, matched against the verified ID token's `sub` |
| `BUDGET_SESSION_SECRET` | A cryptographically random secret with at least 32 bytes |
| `BLOB_STORE_ID` | Connected private Blob store ID for runtime OIDC authentication |
| `BLOB_READ_WRITE_TOKEN` | Alternative to `BLOB_STORE_ID`; keep it server-only |

Create the identity app in Vercel Team Settings → Apps. Enable only `openid` and `profile`, configure the same authentication method as `VERCEL_APP_TOKEN_AUTH_METHOD`, and register the exact callback `${BUDGET_APP_ORIGIN}/api/auth/callback`. Neither resource access nor `offline_access` is needed. Public-client `none` mode still requires PKCE and full signed identity validation; the server never silently falls back when a client secret is missing. Configuration is fail-closed; preview aliases do not receive production access unless the configured origin matches.

Authentication uses PKCE S256, state, nonce, verified RS256 ID tokens, and signed `__Host-` HttpOnly/Secure/SameSite=Lax cookies. Sessions last seven days. Provider access/refresh tokens are discarded. Changing the session secret invalidates existing sessions; changing the allowed owner prevents that former owner's access. Every data request rechecks the owner, every write requires the exact Origin, and all responses use `Cache-Control: private, no-store`.

## Routes

- `GET /api/auth/login`: redirect through Vercel login.
- `GET /api/auth/callback`: verify the identity and redirect to `/#/history`.
- `GET /api/auth/session`: `{authenticated:true,user:{id,name}}`, or HTTP 401.
- `POST /api/auth/logout`: clear login cookies.
- `GET /api/sync?manifest=1`: current `{revision,updatedAt,parts}`. An empty store has `revision:null` and `parts:[]`.
- `GET /api/sync-part?kind=month&monthKey=YYYY-MM&hash=...`: `{part,payload}`. A metadata query omits `monthKey`.
- `PUT /api/sync-part`: `{kind,monthKey?,payload}` → `{part}`.
- `PUT /api/sync`: `{baseRevision,requestId,parts}` → `{revision,updatedAt}`.

A month payload is `{month,overrides:null|record}`. Metadata is a full `budget-app-backup` with `data.months:[]`; its `data.overrides` retains orphan override records. Debt, taxonomy, classification memory, and unknown source-evidence fields are preserved. `debtLedger:null` explicitly represents no debt. The client performs a full validated restore, including clearing absent debt, when adopting a cloud snapshot.

For small clients, `GET /api/sync` returns a whole snapshot, and `PUT /api/sync` also accepts `{baseRevision,requestId,snapshot}`. The regular client uses shards to avoid Vercel Functions' request/response size limit. Each shard is limited to 4 MiB.

All errors return `{error:{code,message}}`; version conflicts add `revision` and use HTTP 409. A conflict must never trigger an unconditional retry against the new revision. The client retains local edits and explicitly resolves which ledger to adopt.

## Storage consistency

Paths are scoped to a SHA-256 hash of the authenticated owner. Month/metadata shards are immutable and content-addressed. Each commit validates all referenced shards and their assembled backup, writes an immutable revision record, then conditionally replaces the latest manifest using its ETag. First creation is also conditional. Concurrent or stale saves fail with HTTP 409. Repeating the same request ID and content is idempotent.

Old revisions and referenced shards are retained. A failed commit may leave an unreferenced immutable shard/revision, but cannot replace the last good ledger. There is currently no retention cleanup; storage consumption grows with edited versions. No public Blob URLs are returned to clients.

## Validation

Run `node --test tests/cloud-auth.test.js tests/cloud-backend.test.js tests/cloud-blob-adapter.test.js tests/cloud-sync.test.js`. Auth requires `jose`; the production storage adapter requires `@vercel/blob`. Tests use synthetic ledgers and in-memory storage, and do not upload financial data.

Before enabling production synchronization, verify the exact production domain, owner login, anonymous 401 responses, private Blob access, cloud restore on a separate browser/device, and stale-version conflict behavior. An existing local ledger and a different cloud ledger require an explicit choice in the client; a cloud account with no ledger can accept the first authorized automatic save.

Official references: [Sign in with Vercel setup](https://vercel.com/docs/sign-in-with-vercel/manage-from-dashboard), [token verification](https://vercel.com/docs/sign-in-with-vercel/tokens), [Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk), [private storage](https://vercel.com/docs/vercel-blob/private-storage).
