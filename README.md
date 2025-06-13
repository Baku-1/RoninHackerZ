# New Hack City - Ronin Wallet

This project is a cyberpunk-themed open world hacking adventure on the Ronin chain. Built for multiplayer experiences, it allows users to connect their Ronin Wallet and explore, interact, and compete in the city.

## Features

- **Ronin Wallet Integration:** Seamless Ronin Wallet connection for authentication and on-chain actions.
- **Immersive UI:** Custom joystick controls, toolbars, and modals for game-like interactions.
- **Leaderboard:** Competitive rankings and stats for top hackers.
- **Bounty Board:** Missions and achievements for players.
- **Chat System:** In-game chat overlay for real-time communication.
- **Faction System:** Players choose factions and compete for city dominance.
- **Puzzle Mini-games:** Skill-based challenges for rewards.
- **Responsive Design:** Mobile and desktop support with touch and drag controls.

## P2P Trading System Vision

> Ronin P2P is designed as a secure peer-to-peer trading platform where users can open trades and post them in a grid view. Other users can view and propose up to three modifications to the agreement, supporting up to 5 NFTs and/or tokens per trade. All trade details remain off-chain until both parties approve the trade.
>
> - **Fee Structure:** 95% of fees are split between two wallets: Admin and Treasury Manager. The remaining 5% is pooled and distributed weekly as rewards to the top 5 users (with declining percentages).
> - **Security:** Final approval by both parties triggers collateral capture and atomic batch settlement to the respective wallets.
> - **Minimal Dependencies:** Designed for security, transparency, and efficiency.

## Getting Started

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/Baku-1/RoninHackerZ.git
   cd RoninHackerZ
   ```

2. **Serve Locally:**
   - Open `index.html` in your browser, or
   - Use a local development server (e.g., VS Code Live Server).

3. **Connect Ronin Wallet:**
   - Click "Connect Ronin Wallet" on the landing screen.
   - Follow prompts to authenticate.

## Technologies

- **Frontend:** Vanilla JS, HTML5, CSS3, Three.js for 3D graphics
- **Wallet:** [Ronin Wallet Widget](https://docs.skymavis.com/ronin-wallet/widget/)
- **Backend (future):** Smart contracts for P2P, leaderboard, rewards

## Roadmap

- [ ] Implement smart contract for P2P trading logic
- [ ] Integrate weekly rewards pool and leaderboard-based payouts
- [ ] NFT and Token escrow/collateralization
- [ ] Enhanced city and player interactions
- [ ] In-game events and missions

## Contributing

Pull requests welcome! Please open an issue to discuss your ideas.

## License

MIT

---
**Disclaimer:** This is a multiplayer pre-alpha community test. Features and assets are not final.
