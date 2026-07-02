# New Hack City - Ronin Wallet

This project is a cyberpunk-themed open world hacking adventure on the Ronin chain. Built for multiplayer experiences, it allows users to connect their Ronin Wallet and explore, interact, and compete in the city.

## Features

- **Ronin Wallet Integration:** Seamless Ronin Wallet connection for authentication and on-chain actions.
- **Immersive UI:** Custom joystick controls, toolbars, and modals for game-like interactions.
- **Leaderboard:** Competitive rankings and stats for top hackers.
- **Bounty Board:** Missions and achievements for players.
- **Chat System:** In-game chat overlay for real-time communication.
- **Faction System:** Players choose factions and compete for city dominance.
- **Stealth Sentries:** Patrol drones with visible vision cones — stay out of the cone, break line of sight behind walls, or go Ghost to slip past.
- **Hacker Toolkit:** Scan (recon: security levels in the city, x-ray obstacle ping in labyrinths), Ghost (sentry invisibility), Drain + packet interception (slow data packets and grab them for Code Fragments), Firewall (reward buff), and Listeners (high-priority intercept windows pay a 2.5x infiltration multiplier).
- **Puzzle Mini-games:** Three vault puzzle types — sequence memory, circuit-trace, and pulse-timing — rotating per building.
- **Responsive Design:** Mobile and desktop support with touch and drag controls.
  
## Getting Started

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/Baku-1/RoninHackerZ.git
   cd RoninHackerZ
   ```

2. **Install & Run the Server:**
   ```bash
   npm install
   npm start
   ```
   Then open [http://localhost:3000](http://localhost:3000). The Node server serves the game
   and runs the realtime multiplayer backend (player state, position sync, chat, leaderboard)
   over WebSockets. Player data persists to `server/data.json`.

3. **Connect Ronin Wallet:**
   - Click "Connect Ronin Wallet" on the landing screen.
   - Follow prompts to authenticate.

## Technologies

- **Frontend:** Vanilla JS, HTML5, CSS3, Three.js for 3D graphics
- **Wallet:** [Ronin Wallet Widget](https://docs.skymavis.com/ronin-wallet/widget/)
- **Backend:** Self-hosted Node.js WebSocket server (`ws`), JSON file persistence
- **Future:** Smart contracts for leaderboard rewards, server-authoritative validation

## Roadmap

- [ ] Implement smart contract for logic
- [ ] Integrate weekly rewards pool and leaderboard-based payouts
- [ ] NFT and Token escrow/collateralization
- [ ] Enhanced city and player interactions
- [ ] In-game events and missions

## Development

```bash
npm run lint   # ESLint over client, server, and tests
npm test       # end-to-end protocol test (boots the real server)
```

The client lives in `public/` as native ES modules (no build step): `js/main.js` is the
entry point, with `game.js` (Three.js world/gameplay), `net.js` (WebSocket client),
`ui.js` (HUD/modals/chat), `state.js` (player state + persistence), and `audio.js`.

## Deployment

The server binds plain HTTP/WS on `PORT` (default 3000). In production, put a TLS
reverse proxy in front so the page and socket are served over `https://`/`wss://`
(the client picks `wss` automatically when the page is https). Example with Caddy:

```
game.example.com {
    reverse_proxy localhost:3000
}
```

(nginx works the same way — proxy `/` to the port with `Upgrade`/`Connection` headers
for WebSocket.) Run the process under a supervisor (systemd, pm2) so it restarts on
failure.

**Important:** player data persists to `server/data.json` (gitignored). Back it up and
keep it on a persistent volume — a redeploy that wipes the working directory wipes
playtest progress with it.

## Contributing

Pull requests welcome! Please open an issue to discuss your ideas.

## License

MIT

---
**Disclaimer:** This is a multiplayer pre-alpha community test. Features and assets are not final.
