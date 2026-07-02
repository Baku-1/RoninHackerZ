// Entry point: wires the net handlers to the game and UI, runs the wallet
// connect flow, and starts the render loop.

import { net } from './net.js';
import { playerState, session, savePlayerState, setStateListener, initializeBounties } from './state.js';
import { playSound } from './audio.js';
import * as ui from './ui.js';
import * as game from './game.js';

setStateListener(ui.updateAllUI);

net.on('state', (msg) => {
    Object.assign(playerState, msg.state);
    ui.updateAllUI();
});
net.on('player', (msg) => game.upsertRemotePlayer(msg.id, msg.data));
net.on('playerLeft', (msg) => game.removePlayer(msg.id));
net.on('chat', (msg) => ui.appendChatMessage(msg.msg));
net.on('chatHistory', (msg) => ui.replaceChatHistory(msg.msgs));
net.on('disconnect', () => {
    if (session.userId) ui.showModal("Connection Lost", "Disconnected from the game server. Refresh to reconnect.");
});

async function loadAndStartGame() {
    ui.updateAllUI();
    // Roster, chat history, and state updates all arrive as server
    // messages via the net handlers after the welcome handshake.
    document.getElementById('landing-overlay').style.display = 'none';
    playSound('sound-ambient', 0.3);
    game.setGamePaused(false);
}

async function selectFaction(factionName) {
    playerState.faction = factionName;
    playerState.playerName = session.userId.substring(0, 8);
    playerState.infiltrations = 0;
    initializeBounties();
    savePlayerState();
    document.getElementById('faction-overlay').style.display = 'none';
    await loadAndStartGame();
}

async function connectAndStart() {
    const btn = document.getElementById('connect-wallet-btn');
    btn.textContent = 'CONNECTING...';
    btn.disabled = true;
    try {
        // Initialize the Ronin Widget
        const widget = new ronin.Widget({
          appName: 'New Hack City',
          appIcon: 'https://i.imgur.com/gcy0s2G.png',
        });

        await widget.connect();
        const accounts = await widget.getAccounts();
        if(!accounts || accounts.length === 0) {
            throw new Error("No Ronin accounts found.");
        }
        playerState.walletAddress = accounts[0];

        const welcome = await net.connect(accounts[0]);
        session.userId = welcome.id;

        if (welcome.state && welcome.state.faction && welcome.state.faction !== 'Unassigned') {
            Object.assign(playerState, welcome.state);
            await loadAndStartGame();
        } else {
            ui.showFactionChoice(selectFaction);
        }

    } catch (err) {
        console.error("Failed to connect wallet or load data:", err);
        ui.showModal("Connection Error", err.message || "Could not connect Ronin Wallet. Please try again.");
        btn.textContent = 'Connect Ronin Wallet';
        btn.disabled = false;
    }
}

document.getElementById('connect-wallet-btn').addEventListener('click', connectAndStart);

// Dev/test hooks for smoke tests and console debugging (pre-alpha only).
window.__nhc = { debug: game.debugApi, playerState };

game.init();
game.animate();
