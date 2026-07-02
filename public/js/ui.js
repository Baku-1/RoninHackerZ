// HUD, modals, chat, leaderboard, and settings. Player names and messages are
// user-controlled, so all of it builds DOM via textContent, never innerHTML.

import { playerState, factions, savePlayerState, session } from './state.js';
import { net } from './net.js';

export function showModal(title, message) {
    const modal = document.getElementById('message-modal');
    modal.querySelector('#modal-title').textContent = title;
    modal.querySelector('#modal-text').textContent = message;
    modal.style.display = 'flex';
}

export function updateNotorietyBar() {
    document.getElementById('notoriety-bar-fill').style.width = `${(playerState.notoriety / playerState.notorietyToNextLevel) * 100}%`;
    document.getElementById('player-level').textContent = `LVL ${playerState.level}`;
}

export function updateListenerCount() {
    document.getElementById('listener-count').textContent = `Listeners: ${playerState.listenersAvailable} / 5`;
    const btn = document.getElementById('deploy-listener-btn');
    if (playerState.listenersAvailable <= 0) {
        btn.classList.add('disabled');
    } else {
        btn.classList.remove('disabled');
    }
}

export function renderBountyBoard() {
    const list = document.getElementById('bounty-list');
    list.innerHTML = '';
    if (!playerState.bounties || playerState.bounties.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No active bounties.';
        list.appendChild(li);
        return;
    }
    playerState.bounties.forEach(bounty => {
        const li = document.createElement('li');
        li.textContent = bounty.description;
        if (bounty.completed) li.classList.add('completed');
        list.appendChild(li);
    });
}

export function updateAllUI() {
    document.getElementById('player-name').textContent = playerState.playerName || 'OFFLINE';
    document.getElementById('currency-count').textContent = `$NXS: ${playerState.nxs || 0} | Fragments: ${playerState.codeFragments || 0}`;
    updateNotorietyBar();
    updateListenerCount();
    renderBountyBoard();
}

let pickupToastTimer = null;
export function showPickupToast(text) {
    const toast = document.getElementById('pickup-toast');
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(pickupToastTimer);
    pickupToastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
}

export function setPlayerLabel(element, playerData) {
    const factionInfo = factions[playerData.faction] || { color: '#aaaaaa' };
    const factionDisplay = (playerData.faction && playerData.faction !== 'Solo' && playerData.faction !== 'Unassigned') ? `[${playerData.faction}]` : '';
    element.textContent = '';
    element.appendChild(document.createTextNode(playerData.playerName || 'Hacker'));
    element.appendChild(document.createElement('br'));
    element.appendChild(document.createTextNode(factionDisplay));
    element.style.color = factionInfo.color;
    element.style.borderColor = factionInfo.color;
}

export function appendChatMessage(data) {
    const messagesDiv = document.getElementById('chat-messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    const factionInfo = factions[data.faction] || { color: '#aaaaaa' };
    const nameSpan = document.createElement('span');
    nameSpan.style.color = factionInfo.color;
    nameSpan.textContent = `${data.playerName || 'Hacker'}: `;
    msgEl.appendChild(nameSpan);
    msgEl.appendChild(document.createTextNode(data.message || ''));
    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

export function replaceChatHistory(messages) {
    document.getElementById('chat-messages').innerHTML = '';
    (messages || []).forEach(appendChatMessage);
}

export function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (message === '' || !session.userId) return;
    net.send({ t: 'chat', message });
    input.value = '';
}

export async function openLeaderboard() {
    const leaderboardOverlay = document.getElementById('leaderboard-overlay');
    leaderboardOverlay.style.display = 'flex';
    const list = document.getElementById('top-hackers-list');
    list.innerHTML = '<li>Loading...</li>';

    document.getElementById('personal-infiltrations').textContent = playerState.infiltrations || 0;

    try {
        const result = await net.request('leaderboard');
        document.getElementById('average-infiltrations').textContent = (result.average || 0).toFixed(2);

        list.innerHTML = '';
        const top10 = result.top || [];

        if (top10.length === 0) {
             list.innerHTML = '<li>No ranked players yet.</li>';
        } else {
            top10.forEach((player, index) => {
                const item = document.createElement('li');
                const rank = document.createElement('span');
                rank.className = 'leaderboard-rank';
                rank.textContent = `${index + 1}.`;
                const name = document.createElement('span');
                name.className = 'leaderboard-name';
                name.textContent = player.name;
                const score = document.createElement('span');
                score.className = 'leaderboard-score';
                score.textContent = player.score;
                item.append(rank, ' ', name, ' ', score);
                list.appendChild(item);
            });
        }

    } catch (error) {
        console.error("Error fetching leaderboard data:", error);
        list.innerHTML = '<li>Error loading data.</li>';
    }
}

export function openSettingsModal() {
    const settingsOverlay = document.getElementById('settings-overlay');
    const factionSection = document.getElementById('settings-faction-section');
    const nameInput = document.getElementById('name-change-input');
    nameInput.value = playerState.playerName || '';

    if (playerState.faction === 'Solo' || playerState.faction === 'Unassigned') {
        const choicesContainer = factionSection.querySelector('.faction-choices');
        choicesContainer.innerHTML = '';
        for (const factionName in factions) {
            const btn = document.createElement('button');
            btn.className = 'faction-btn';
            btn.textContent = `Join ${factionName}`;
            btn.style.borderColor = factions[factionName].color;
            btn.style.textShadow = `0 0 8px ${factions[factionName].color}`;
            btn.onclick = () => {
                playerState.faction = factionName;
                savePlayerState();
                showModal("Faction Joined", `You are now a member of ${factionName}.`);
                openSettingsModal();
            };
            choicesContainer.appendChild(btn);
        }
        factionSection.style.display = 'block';
    } else {
        factionSection.style.display = 'none';
    }

    settingsOverlay.style.display = 'flex';
    document.getElementById('settings-save-btn').onclick = () => {
        const newName = nameInput.value.trim();
        if (newName && newName !== playerState.playerName) {
            playerState.playerName = newName;
        }
        savePlayerState();
        settingsOverlay.style.display = 'none';
        showModal("Settings Saved", "Your profile has been updated.");
    };
}

export function showFactionChoice(onChoose) {
    const overlay = document.getElementById('faction-overlay');
    const choicesContainer = overlay.querySelector('.faction-choices');
    choicesContainer.innerHTML = '';

    for (const factionName in factions) {
        const btn = document.createElement('button');
        btn.className = 'faction-btn';
        btn.textContent = `Join ${factionName}`;
        btn.style.borderColor = factions[factionName].color;
        btn.style.textShadow = `0 0 8px ${factions[factionName].color}`;
        btn.onclick = () => onChoose(factionName);
        choicesContainer.appendChild(btn);
    }

    const soloBtn = document.createElement('button');
    soloBtn.className = 'faction-btn';
    soloBtn.textContent = 'Play Solo';
    soloBtn.style.borderColor = '#888888';
    soloBtn.onclick = () => onChoose('Solo');
    choicesContainer.appendChild(soloBtn);

    overlay.style.display = 'flex';
}

export function setupModals({ onLevelOverlayClose }) {
    document.getElementById('menu-toggle-btn').addEventListener('click', () => {
        const menu = document.getElementById('menu-panel');
        menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
    });

    document.getElementById('chat-toggle-btn').addEventListener('click', () => {
        document.getElementById('chat-overlay').style.display = document.getElementById('chat-overlay').style.display === 'flex' ? 'none' : 'flex';
        document.getElementById('menu-panel').style.display = 'none';
    });

    document.getElementById('leaderboard-btn').addEventListener('click', openLeaderboard);
    document.getElementById('settings-btn').addEventListener('click', openSettingsModal);
    document.getElementById('refinement-btn').addEventListener('click', () => { showModal("Coming Soon", "The Refinement system is under development."); });

    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.onclick = () => {
            const modal = btn.closest('.modal, #level-overlay, #faction-overlay');
            if (modal) modal.style.display = 'none';
            if (modal && modal.id === 'level-overlay') onLevelOverlayClose();
        };
    });

    document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
}
