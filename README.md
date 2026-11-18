# Mets Jeopardy · 2026

An individual-player game for Daniel's Engineering game day. Built for ChatGPT Sites with durable D1 room state, host authorization, synchronized buzzers, private final wagers/answers and a question editor.

Live rooms start with an empty question bank. The two rounds each support six categories and five values, followed by Final Jeopardy. Only filled question/answer pairs appear as playable clues. The host must add at least one clue to each round and a final before starting. Practice mode is local, explicitly labeled, and uses placeholder clues and sample players.

Host creation is restricted to the authenticated account dgoetz@nymets.com. Subsequent host actions use the Site-scoped authenticated user ID stored on the room. Other authenticated visitors join using a six-character code. Membership and sharing are enforced by ChatGPT Sites. A room code does not bypass the Site access policy.

State writes use an optimistic compare-and-swap revision in D1. The first accepted buzzer request wins; network latency can affect arrival order. Scoring commands require the host's displayed revision to prevent duplicate updates. Player responses and wagers are omitted from other participants' payloads until the final reveal. Scores persist across refreshes. Client local storage keeps only the last room code.

Questions: edit inside the lobby, or export/import the provided JSON format. Final responses are scored manually by the host. The game has no Daily Doubles; all ordinary clues use fixed values. Final participation requires a positive score.

Checks: npm exec tsc -- --noEmit; node --experimental-strip-types --test tests/game.test.mjs; npm run build.

Photo sources: official MLB-hosted Citi Field and Mr./Mrs. Met photographs, retained as local assets in public/images. No mockup screenshots are used as controls.

## Verification

- TypeScript check passed.
- 22 rule, authorization and privacy tests passed.
- Built Worker + isolated D1 integration test passed concurrent joins, simultaneous buzzing, duplicate-score rejection, host authorization, final privacy, persistent result reads and server rendering.
- Runtime test: node --import ./scripts/sites-env.mjs --experimental-strip-types tests/runtime.test.mjs
- Browser visual QA remains unverified: the managed preview relay is unavailable in this session.

## Source export

This repository preserves the tested game implementation. See [DEPLOYMENT.md](DEPLOYMENT.md) for build commands, external-hosting requirements and the current authentication dependency. No production deployment or live database is included.
