# Mets Jeopardy

Public game: https://mets-jeopardy.danielgoetz301.chatgpt.site/

To host, open the site on your laptop and select **Host a game**. Share the displayed six-character room code and the public link. Players open the link on their own phones or laptops, select **Join a game**, and enter the code and their names. No account or host password is needed for a new room. Keep the hosting browser's session active during play; its private cookie grants control of that room. The same browser can resume the room within the eight-hour host session. An expired or signed-out session cannot recover a newly created room; create a new room in that case.

The game has 60 selected board clues across Jeopardy and Double Jeopardy, plus the selected Final Jeopardy clue. The host can edit or import/export questions. The category `2026` and the original Mets photo assets are retained. Practice mode stays local to the browser and uses labeled placeholder clues.

Room state and session records live in Cloudflare D1. The server assigns player identities, orders buzzes using the first accepted write, validates host commands against the room's private host session, and keeps Final Jeopardy wagers and responses private until reveal. The maximum room size is 24 players. Close buzzer races depend on network arrival order. There are no Daily Doubles; ordinary clues use fixed values. Final participation requires a positive score.

Run the checks with Node.js 22.13 or newer:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:integration
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for production configuration, session security, and the source history.
