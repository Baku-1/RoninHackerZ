// Shared game state: the local player's data, faction/dApp definitions, and
// persistence to the server.

import * as THREE from 'three';
import { net } from './net.js';

export const session = { userId: null };

export const factions = {
    'Cipher Hackers': { color: '#f000ff' },
    'Data Kraken': { color: '#00ffde' },
    'Sovereign Key': { color: '#ff4400' }
};

export const playerState = {
    level: 1,
    notoriety: 0,
    notorietyToNextLevel: 100,
    listenersAvailable: 5,
    deployedListenerCount: 0,
    infiltrations: 0,
    nxs: 0,
    codeFragments: 0,
    bounties: [],
    playerName: 'OFFLINE',
    faction: 'Unassigned',
    walletAddress: null
};

export const dApps = [
    { name: 'Axie Infinity', color: new THREE.Color('#49C3E0'), securityLevel: 4 },
    { name: 'The Machines Arena', color: new THREE.Color('#FF4400'), securityLevel: 3 },
    { name: 'Pixels', color: new THREE.Color('#7CFC00'), securityLevel: 2 },
    { name: 'Sunflower Land', color: new THREE.Color('#FFD700'), securityLevel: 1 },
    { name: 'Apeiron', color: new THREE.Color('#9400D3'), securityLevel: 3 },
    { name: 'Wild Forest', color: new THREE.Color('#228B22'), securityLevel: 2 },
    { name: 'Kaidro Chronicle', color: new THREE.Color('#FF1493'), securityLevel: 2 },
    { name: 'Ragnarok: Monster World', color: new THREE.Color('#FF6347'), securityLevel: 2 },
    { name: 'Puffverse', color: new THREE.Color('#FFC0CB'), securityLevel: 1 },
    { name: 'CyberKongz', color: new THREE.Color('#A0522D'), securityLevel: 2 },
    { name: 'Nifty Island', color: new THREE.Color('#87CEEB'), securityLevel: 1 },
    { name: 'Kuroro Beasts', color: new THREE.Color('#DAA520'), securityLevel: 2 },
    { name: 'CipherSwap', color: new THREE.Color('#f000ff'), securityLevel: 1 },
    { name: 'Ronin Financial', color: new THREE.Color('#0072FF'), securityLevel: 2 },
    { name: 'Sky Mavis HQ', color: new THREE.Color('#00ffde'), securityLevel: 4 }
];

// The UI layer registers a listener so every state change refreshes the HUD
// without state.js needing to import the UI (keeps the module graph acyclic).
let stateListener = null;
export function setStateListener(fn) { stateListener = fn; }

export function savePlayerState() {
    if (stateListener) stateListener();
    if (!session.userId) return;
    const { level, notoriety, notorietyToNextLevel, listenersAvailable, deployedListenerCount,
            infiltrations, nxs, codeFragments, bounties, playerName, faction, walletAddress } = playerState;
    net.send({ t: 'save', state: { level, notoriety, notorietyToNextLevel, listenersAvailable,
            deployedListenerCount, infiltrations, nxs, codeFragments, bounties, playerName, faction, walletAddress } });
}

export function initializeBounties() {
    const easyTargets = dApps.filter(d => d.securityLevel <= 2);
    const hardTargets = dApps.filter(d => d.securityLevel >= 3);
    const easy = easyTargets[Math.floor(Math.random() * easyTargets.length)];
    const hard = hardTargets[Math.floor(Math.random() * hardTargets.length)];
    playerState.bounties = [
        { type: 'infiltrate', target: easy.name, bonus: 50, completed: false, description: `Infiltrate ${easy.name} (+50)` },
        { type: 'infiltrate', target: hard.name, bonus: 150, completed: false, description: `Crack high-security ${hard.name} (+150)` },
        { type: 'deploy', target: 2, bonus: 75, completed: false, description: 'Deploy 2 listeners (+75)' }
    ];
}
