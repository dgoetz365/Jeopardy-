# Mets Jeopardy deployment

The application is a React/Vinext Cloudflare Worker with D1 persistence. Production is published through ChatGPT Sites, which provisions the Worker and D1 database. Players use the public URL, a six-character room code, and a name. No ChatGPT or Mets account is required.

## Preserved source history

- Original source: `e9e4c053808130e749a0b3a54d8a4491b10104f0`.
- Initial public auth: `db0ebd5195a5cd74a50816b89491a31a70c5012a`.
- GitHub: https://github.com/dgoetz365/Jeopardy-

Both original commits are retained as ancestors. Do not force-push over remote work.

## Production configuration

`.openai/hosting.json` holds the Site ID and logical `DB` binding. Sites applies the ordered schema migrations in `drizzle/` before uploading the built Worker. The source manifest and migrations contain no credentials. Approved questions live in the server-only `content/approved-*.json` files, loaded by `lib/starter-bank.ts`, not the public client bundle.

New rooms need no password or application secret. The previously configured server-only `HOST_PASSWORD` secret is retained solely to restore access to rooms created under the earlier shared-password system. If operating those older rooms, set the same value through the hosting platform. Never place it in Git, a browser bundle, the hosting manifest, or a URL. Runtime secrets are separate from build-time variables. Publish a saved version to apply a changed environment revision.

The public audience is required. A private Site would impose platform sign-in before players can reach the game. No application authorization relies on `oai-authenticated-*` headers, even on Sites.

## Authentication and sessions

- Anyone can create a room in one click. The server issues its browser a private host session and stores that session's identity on the new room. A room code grants no host privileges. A browser already hosting cannot join as a player, avoiding accidental loss of its host cookie; use another browser or device to play.
- The earlier password endpoint exists for historical rooms only. It verifies the password on the server and checks the room's original host identity. That password cannot access rooms created by the one-click flow. No password field is displayed in the current UI.
- Cookies contain 256-bit random bearer tokens. Only SHA-256 token hashes and server-assigned identities are persisted in D1.
- HTTPS cookies use the `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Strict`, and path `/`, with no Domain attribute. HTTP local development uses a different cookie name.
- Host sessions expire after 8 hours; guest sessions after 7 days. Every request verifies the stored session and expiry. Sign out revokes the token immediately. Leaving a view preserves the session for resumption.
- A valid host session can create and resume multiple rooms in the same browser. Historical-room password recovery rotates the token. One-click rooms have no account-based recovery after expiry or sign-out; create a new room if the host session is lost. Existing host sessions remain usable for their rooms until expiry or explicit sign-out.
- The server ignores client-supplied identity/role fields. Guests cannot read another room, use host commands, see unplayed answers, or see another player's private wager or response before reveal. Hosts also cannot see private wagers and responses before reveal.
- Mutations require a same-origin Origin header and JSON content type. Bodies are capped at 150,000 bytes while streaming.
- D1 atomic rate limits apply per client IP and per session. Room creation: 3 per IP per 10 minutes and 12 per IP per day; historical password attempts: 10 per IP per 15 minutes; joins: 30 per IP per minute; session commands: 120 per minute; reads: 240 per session per minute. Shared-IP request ceilings accommodate a 24-player room. A 429 response includes Retry-After. Expired session/limiter rows are cleaned in bounded background batches.

## Content

Every new live room starts with the owner's 60 selected board clues and selected Final Jeopardy clue, filling all 61 slots. The selections are recorded in `content/approved-*.json`, including `content/approved-final.json` for the AI Model Names clue. Hosts can edit them in the question editor. Existing rooms can fill untouched slots through the host-only fill action; edited categories and clues are preserved. The category `2026` is preserved. A real game requires at least one completed clue in each round and a Final Jeopardy clue. Empty slots remain disabled.

Practice mode is browser-local, labeled as placeholder content, and never writes its sample clues or players to D1. Test fixtures are synthetic and are not approved trivia.

Original photo assets remain at `public/images/citi-field.jpg` and `public/images/mr-and-mrs-met.jpg`.

## Verification

Use Node.js 22.13 or newer and the committed lockfile:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:integration
```

The integration suite loads the production build into Miniflare with isolated D1 and an ephemeral historical-room credential. It verifies one-click creation, authentication/CSRF/body limits, cookie security, anonymous concurrent joins, session reuse/revocation/expiry, historical-room recovery, host authorization, full round progression, simultaneous buzzes, duplicate scoring, final privacy/scoring, atomic rate limits, capacity, page rendering, and original photo packaging. It never accesses production data.

Local runtime secrets belong only in ignored `.dev.vars` files. Local migrations and test databases are distinct from production. No passwords, access tokens, cookies, or runtime database contents belong in source archives.

## Synchronization and operating limits

The server uses optimistic version checks and atomic D1 updates. Concurrent joins and player actions retry conflicts; stale host commands return 409 rather than applying twice. Clients poll every 650 ms during clues and less often in other phases. Buzzer order is determined by the first accepted server update, so network latency can affect close races. Maximum room size is 24 individual players.

Keep the host browser session active during play. The app does not include account-based host or guest recovery across browsers or devices: a player should resume using the browser that joined. Hosts should export approved question files for reuse in another room.

Logo: original MLB-hosted Mets cap logo, https://www.mlbstatic.com/team-logos/121.svg, saved locally without modification. Source links are included on factual clues where recorded with the selection. Arithmetic puzzles are authored and show their reasoning in the accepted response.
