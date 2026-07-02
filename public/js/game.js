// The Three.js world and gameplay: city, labyrinths, obstacles, the vault
// puzzle, abilities, movement, and remote player avatars.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { playerState, dApps, factions, session, savePlayerState } from './state.js';
import { net } from './net.js';
import { playSound } from './audio.js';
import { showModal, setPlayerLabel, setupModals } from './ui.js';

let scene, camera, renderer, composer, labelRenderer, raycaster, bloomPass;
const buildings = [], skyscraperMeshes = [];
let dataPackets = [];
const clock = new THREE.Clock();
const moveState = { forward: 0, right: 0 };

let cityGroup, currentLabyrinth;
let isCityVisible = true;
let currentInfiltratedBuilding = null;
let gamePaused = true;

const otherPlayers = new Map();
let lastPositionUpdateTime = 0;

export function setGamePaused(value) { gamePaused = value; }

const abilities = {
    scan:     { btn: null, cooldown: 10000, lastUsed: 0 },
    firewall: { btn: null, cooldown: 60000, lastUsed: 0, duration: 20000, buffActive: false },
    drain:    { btn: null, cooldown: 15000, lastUsed: 0, duration: 5000, active: false, position: new THREE.Vector3() },
    ghost:    { btn: null, cooldown: 30000, lastUsed: 0, duration: 10000, active: false },
    listener: { btn: null, cooldown: 2000, lastUsed: 0 }
};

export function init() {
    abilities.scan.btn = document.getElementById('scan-btn');
    abilities.firewall.btn = document.getElementById('firewall-btn');
    abilities.drain.btn = document.getElementById('drain-btn');
    abilities.ghost.btn = document.getElementById('ghost-btn');
    abilities.listener.btn = document.getElementById('deploy-listener-btn');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005);
    scene.fog = new THREE.FogExp2(0x000005, 0.002);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.rotation.order = 'YXZ';
    raycaster = new THREE.Raycaster();
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);
    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none';
    document.body.appendChild(labelRenderer.domElement);

    setupMobileControls();
    setupAbilityControls();

    const ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
    scene.add(ambient);
    cityGroup = new THREE.Group();
    createNetworkFloor(cityGroup, renderer);
    const totalBuildings = 75;
    const cityArea = 2000;
    for (let i = 0; i < totalBuildings; i++) {
        const hasLabel = i < dApps.length;
        const dApp = dApps[i % dApps.length];
        createSkyscraper(dApp, new THREE.Vector3((Math.random() - 0.5) * cityArea, 0, (Math.random() - 0.5) * cityArea), hasLabel);
    }
    scene.add(cityGroup);
    const renderPass = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.4, 0.1);
    composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    setInterval(generateDataTransfer, 200);
    setInterval(() => { if(abilities.ghost.active) return; const blip = document.getElementById('radar-blip'); blip.style.left = `${20 + Math.random() * 60}%`; blip.style.top = `${20 + Math.random() * 60}%`; blip.classList.toggle('active'); setTimeout(() => blip.classList.remove('active'), 500); }, 3000);
    setInterval(simulateHighPriorityData, 15000);
    setupModals({ onLevelOverlayClose: returnToCity });
    initPuzzle();
    returnToCity();

    window.addEventListener('resize', onWindowResize);
}

export function returnToCity() {
    gamePaused = false;
    if(bloomPass) { bloomPass.strength = 0.9; bloomPass.threshold = 0.1; }
    isCityVisible = true;
    cityGroup.visible = true;
    otherPlayers.forEach(p => p.avatar.visible = true);
    document.getElementById('level-overlay').style.display = 'none';
    document.getElementById('puzzle-overlay').style.display = 'none';
    if (currentLabyrinth) { scene.remove(currentLabyrinth.group); }
    currentLabyrinth = null;
    currentInfiltratedBuilding = null;
    camera.position.set(0, 10, 50);
    camera.rotation.set(0, 0, 0);
}

function createSkyscraper(dApp, position, addLabel) {
    const height = Math.random() * 300 + 100, width = Math.random() * 40 + 25;
    const textureData = createScrollingCodeTexture(dApp.color.getHexString());
    const material = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: dApp.color, emissiveMap: textureData.texture, toneMapped: false });
    const skyscraper = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), material);
    skyscraper.position.set(position.x, height / 2, position.z);
    skyscraper.userData = {
        name: dApp.name,
        securityLevel: dApp.securityLevel,
        hasListener: false,
        originalColor: material.emissive.clone(),
        isFlashing: false,
        isTarget: addLabel // Flag to know if this is a target or filler
    };
    cityGroup.add(skyscraper);
    if(addLabel) { // Only add to arrays if it's a target
         buildings.push(textureData);
         skyscraperMeshes.push(skyscraper);
    }

    if (addLabel) {
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label'; labelDiv.textContent = dApp.name;
        const cssColor = `#${dApp.color.getHexString()}`;
        labelDiv.style.borderColor = cssColor; labelDiv.style.color = cssColor;
        const nameLabel = new CSS2DObject(labelDiv);
        nameLabel.position.set(0, height / 2 + 20, 0);
        skyscraper.add(nameLabel);
        skyscraper.userData.label = nameLabel;
    }
}

function loadLabyrinthLevel(building) {
    if (currentLabyrinth || !building.userData.isTarget) return; // Only allow entering target buildings
    currentInfiltratedBuilding = building;
    if(bloomPass) { bloomPass.strength = 0.4; bloomPass.threshold = 0.5; }
    isCityVisible = false;
    cityGroup.visible = false;
    otherPlayers.forEach(p => p.avatar.visible = false);

    const buildingSecurity = building.userData.securityLevel || 1;
    const floorCount = Math.min(3, 1 + Math.floor(buildingSecurity / 2));
    currentLabyrinth = {
        group: new THREE.Group(),
        floors: [],
        currentFloor: 0,
    };

    for(let i = 0; i < floorCount; i++) {
        const yOffset = i * 200;
        const isFinal = (i === floorCount - 1);
        const floor = createLabyrinthFloor(building, yOffset, isFinal);
        currentLabyrinth.floors.push(floor);
        currentLabyrinth.group.add(floor.mazeGroup);
    }

    scene.add(currentLabyrinth.group);
    teleportToFloor(0);
}

function createLabyrinthFloor(building, yOffset, isFinal = false) {
    const mazeGroup = new THREE.Group();
    const obstacles = [];
    const mazeWalls = [];
    let openCoords = [];
    const securityLevel = building.userData.securityLevel || 1;
    const mazeSize = 11 + securityLevel * 2, cellSize = 50, wallHeight = 20;
    const maze = generateMaze(mazeSize, mazeSize);
    braidMaze(maze, mazeSize, 0.1);

    const wallMaterial = new THREE.MeshStandardMaterial({
        color: building.material.emissive, emissive: building.material.emissive,
        emissiveIntensity: 0.6, toneMapped: true, metalness: 0.2, roughness: 0.8
    });
    const wallGeometry = new THREE.BoxGeometry(cellSize, wallHeight, cellSize);

    const numSentries = securityLevel;
    const numLasers = Math.floor(securityLevel / 2);

    for (let i = 0; i < mazeSize; i++) {
        for (let j = 0; j < mazeSize; j++) {
            const worldX = (j - mazeSize / 2) * cellSize;
            const worldZ = (i - mazeSize / 2) * cellSize;
            if (maze[i][j] === 1) {
                const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                wall.position.set(worldX, wallHeight / 2 + yOffset, worldZ);
                mazeGroup.add(wall);
                mazeWalls.push(wall);
            } else {
                openCoords.push(new THREE.Vector3(worldX, 5 + yOffset, worldZ));
            }
        }
    }

    const startPos = new THREE.Vector3((-mazeSize/2 + 1.5) * cellSize, 10 + yOffset, (-mazeSize/2 + 1.5) * cellSize);
    const endPos = new THREE.Vector3((mazeSize/2 - 1.5) * cellSize, 10 + yOffset, (mazeSize/2 - 1.5) * cellSize);

    if(isFinal) {
        const vault = new THREE.Mesh(new THREE.BoxGeometry(20,20,20), new THREE.MeshStandardMaterial({color: 0xffffff, emissive: 0xaaaaaa, emissiveIntensity: 1}));
        vault.position.copy(endPos);
        vault.name = 'vault';
        mazeGroup.add(vault);
    } else {
         const teleporter = new THREE.Mesh(new THREE.CylinderGeometry(10,10,1,32), new THREE.MeshBasicMaterial({color: 0x00ffde, transparent: true, opacity: 0.5}));
         teleporter.position.copy(endPos).y = 0.1 + yOffset;
         teleporter.name = 'teleporter';
         mazeGroup.add(teleporter);
    }

    for(let i = 0; i < numSentries; i++) {
        if(openCoords.length > 2) {
            const sentry = createSentry(openCoords.splice(Math.floor(Math.random() * openCoords.length), 1)[0]);
            sentry.userData.path = [openCoords.splice(Math.floor(Math.random() * openCoords.length), 1)[0], openCoords.splice(Math.floor(Math.random() * openCoords.length), 1)[0]];
            sentry.userData.pathProgress = 0;
            sentry.userData.pathDirection = 1;
            sentry.userData.speed = 0.15 + securityLevel * 0.05;
            obstacles.push(sentry);
            mazeGroup.add(sentry);
        }
    }

    const laserSpan = (mazeSize / 2 - 1) * cellSize;
    for(let i = 0; i < numLasers; i++) {
        const laserZ = (Math.random() - 0.5) * (mazeSize - 4) * cellSize;
        const laser = createLaser(new THREE.Vector3(-laserSpan, 10 + yOffset, laserZ), new THREE.Vector3(laserSpan, 10 + yOffset, laserZ));
        obstacles.push(laser);
        mazeGroup.add(laser.mesh);
    }

    return { mazeGroup, mazeWalls, startPos, endPos, obstacles };
}

function teleportToFloor(floorIndex) {
    if (!currentLabyrinth || !currentLabyrinth.floors[floorIndex]) return;
    currentLabyrinth.currentFloor = floorIndex;
    const floor = currentLabyrinth.floors[floorIndex];
    camera.position.copy(floor.startPos);
    camera.rotation.set(0, 0, 0);
}

function createSentry(position) {
    const sentry = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), new THREE.MeshBasicMaterial({color: 0xff4400, wireframe: true}));
    sentry.position.copy(position);
    sentry.userData.type = 'sentry';
    return sentry;
}

// A short beam (~2 cells long) that sweeps along the start->end line, so it can
// be timed and dodged rather than blocking the whole row.
function createLaser(start, end, beamLength = 100) {
    const material = new THREE.MeshBasicMaterial({ color: 0xff4400 });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, beamLength, 8), material);
    const dir = end.clone().sub(start).normalize();
    mesh.position.copy(start);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return { mesh, start, end, dir, halfLength: beamLength / 2, type: 'laser', progress: 0, direction: 1 };
}

function distanceToSegment(point, a, b) {
    const ab = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, point.clone().sub(a).dot(ab) / ab.lengthSq()));
    return point.distanceTo(a.clone().add(ab.multiplyScalar(t)));
}

function updateObstacles(delta) {
    if (!currentLabyrinth || gamePaused) return;
     currentLabyrinth.floors.forEach(floor => {
         floor.obstacles.forEach(obs => {
            if (obs.type === 'laser') {
                obs.progress += delta * 0.5 * obs.direction;
                if (obs.progress > 1 || obs.progress < 0) {
                    obs.direction *= -1;
                    obs.progress = Math.max(0, Math.min(1, obs.progress));
                }
                obs.mesh.position.lerpVectors(obs.start, obs.end, obs.progress);
            } else if (obs.userData.type === 'sentry') {
                 if (obs.userData.path && obs.userData.path[0] && obs.userData.path[1]) {
                    obs.userData.pathProgress += delta * (obs.userData.speed || 0.2) * obs.userData.pathDirection;
                    if(obs.userData.pathProgress > 1 || obs.userData.pathProgress < 0) {
                        obs.userData.pathDirection *= -1;
                        obs.userData.pathProgress = Math.max(0, Math.min(1, obs.userData.pathProgress));
                    }
                    obs.position.lerpVectors(obs.userData.path[0], obs.userData.path[1], obs.userData.pathProgress);
                }
            }
        });
     });
}

let puzzleSequence = [], playerSequence = [], puzzleActive = false, puzzleButtons = [];

function initPuzzle() {
    const grid = document.getElementById('puzzle-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        const btn = document.createElement('div');
        btn.className = 'puzzle-btn';
        btn.dataset.id = i;
        btn.addEventListener('click', () => handlePuzzleClick(i));
        grid.appendChild(btn);
        puzzleButtons.push(btn);
    }
}

function startPuzzle() {
    gamePaused = true;
    puzzleActive = true;
    document.getElementById('puzzle-overlay').style.display = 'flex';
    puzzleSequence = [];
    playerSequence = [];
    const securityLevel = currentInfiltratedBuilding.userData.securityLevel || 1;
    const requiredLength = 3 + securityLevel;
    document.getElementById('puzzle-status').textContent = `Required sequence length: ${requiredLength}. Watch...`;
    addToPuzzleSequence(requiredLength);
}

function addToPuzzleSequence(requiredLength) {
    playerSequence = [];
    if (puzzleSequence.length < requiredLength) {
        puzzleSequence.push(Math.floor(Math.random() * 9));
    }
    playPuzzleSequence(requiredLength);
}

async function playPuzzleSequence(requiredLength) {
    for (const id of puzzleSequence) {
        await new Promise(resolve => setTimeout(resolve, 500));
        puzzleButtons[id].classList.add('lit');
        await new Promise(resolve => setTimeout(resolve, 500));
        puzzleButtons[id].classList.remove('lit');
    }
     document.getElementById('puzzle-status').textContent = `Your turn... (${puzzleSequence.length}/${requiredLength})`;
}

function handlePuzzleClick(id) {
    if (!puzzleActive || playerSequence.length >= puzzleSequence.length) return;
    playSound('sound-ui-click', 0.8);
    playerSequence.push(id);
    puzzleButtons[id].classList.add('lit');
    setTimeout(() => puzzleButtons[id].classList.remove('lit'), 200);

    const requiredLength = 3 + (currentInfiltratedBuilding.userData.securityLevel || 1);
    const lastIndex = playerSequence.length - 1;
    if (playerSequence[lastIndex] !== puzzleSequence[lastIndex]) {
        document.getElementById('puzzle-status').textContent = "Incorrect! Sequence restarting...";
        puzzleActive = false;
        setTimeout(() => startPuzzle(), 2000);
        return;
    }

    if (playerSequence.length === puzzleSequence.length) {
        if (puzzleSequence.length >= requiredLength) {
            winPuzzle();
        } else {
            setTimeout(() => addToPuzzleSequence(requiredLength), 1000);
        }
    }
}

function winPuzzle() {
    puzzleActive = false;
    gamePaused = true;
    document.getElementById('puzzle-overlay').style.display = 'none';

    playerState.infiltrations = (playerState.infiltrations || 0) + 1;

    playerState.bounties.forEach(bounty => {
        if (!bounty.completed && bounty.type === 'infiltrate' && currentInfiltratedBuilding.userData.name === bounty.target) {
            bounty.completed = true;
            addNotoriety(bounty.bonus);
            showModal("Bounty Complete!", `+${bounty.bonus} Bonus Notoriety!`);
            playSound('sound-bounty-complete');
        }
    });

    const securityLevel = currentInfiltratedBuilding.userData.securityLevel || 1;
    let baseNotoriety = (abilities.firewall.buffActive ? 50 : 25) * securityLevel;
    let listenerBonus = 0;
    let rewardHTML = '';

    if (currentInfiltratedBuilding && currentInfiltratedBuilding.userData.hasListener) {
        listenerBonus = 20 * securityLevel;
        rewardHTML += `<br>+${listenerBonus} Notoriety (Listener Bonus)`;
    }

    const nxsGain = (abilities.firewall.buffActive ? 20 : 10) * securityLevel;
    const fragmentsGain = (abilities.firewall.buffActive ? 10 : 5) * securityLevel;
    const totalNotorietyGain = baseNotoriety + listenerBonus;

    document.getElementById('level-message').innerHTML = 'SYSTEM INFILTRATED.';
    document.getElementById('reward-details').innerHTML = `REWARDS:<br>+${baseNotoriety} Notoriety` + rewardHTML + `<br>+${nxsGain} $NXS<br>+${fragmentsGain} Code Fragments`;

    if (abilities.firewall.buffActive) {
       document.getElementById('reward-details').innerHTML += `<br>(FIREWALL BUFF ACTIVE)`;
       abilities.firewall.buffActive = false;
       abilities.firewall.btn.classList.remove('buff-active');
    }
    addNotoriety(totalNotorietyGain);
    savePlayerState();
    document.getElementById('level-overlay').style.display = 'flex';
}

function handleMovement(delta) {
    if (gamePaused) return;
    const moveSpeed = (isCityVisible ? 150.0 : 60.0) * delta;

    const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

    const moveVector = new THREE.Vector3();
    if (moveState.forward) moveVector.add(cameraDirection.clone().multiplyScalar(moveState.forward));
    if (moveState.right) moveVector.add(right.clone().multiplyScalar(moveState.right));

    if(moveVector.lengthSq() > 0) {
        moveVector.y = 0;
        moveVector.normalize();
        if (canMove(moveVector.clone())) {
            camera.position.add(moveVector.multiplyScalar(moveSpeed));
        }
    }
}

function canMove(direction) {
    if (isCityVisible || !currentLabyrinth) return true;
    const floor = currentLabyrinth.floors[currentLabyrinth.currentFloor];
    if (!floor || !floor.mazeWalls) return true;

    raycaster.set(camera.position, direction);
    const intersections = raycaster.intersectObjects(floor.mazeWalls);

    return !(intersections.length > 0 && intersections[0].distance < 10);
}

function applyPenalty() {
    playSound('sound-penalty');
    showModal("Security Alert", "Infiltration failed. Notoriety lost.");
    addNotoriety(-10);
}

function checkProximity() {
    if (gamePaused) return;

    if (isCityVisible) {
        const playerBox = new THREE.Box3().setFromCenterAndSize(camera.position, new THREE.Vector3(1,1,1));
        for (const building of skyscraperMeshes) {
            const buildingBox = new THREE.Box3().setFromObject(building);
            if (playerBox.intersectsBox(buildingBox)) {
                loadLabyrinthLevel(building);
                return;
            }
        }
    } else if (currentLabyrinth) {
        const floor = currentLabyrinth.floors[currentLabyrinth.currentFloor];
        const floorGroup = floor.mazeGroup;

        const vault = floorGroup.getObjectByName('vault');
        if (vault && camera.position.distanceTo(vault.position) < 20) {
            startPuzzle();
            return;
        }

        const teleporter = floorGroup.getObjectByName('teleporter');
        if (teleporter && camera.position.distanceTo(teleporter.position) < 15) {
            const nextFloorIndex = currentLabyrinth.currentFloor + 1;
            if(nextFloorIndex < currentLabyrinth.floors.length) {
                teleportToFloor(nextFloorIndex);
            }
            return;
        }

        for (const obs of floor.obstacles) {
            let hit;
            if (obs.type === 'laser') {
                // Collide with the whole sweeping beam, not just its center point.
                const beamStart = obs.mesh.position.clone().addScaledVector(obs.dir, -obs.halfLength);
                const beamEnd = obs.mesh.position.clone().addScaledVector(obs.dir, obs.halfLength);
                hit = distanceToSegment(camera.position, beamStart, beamEnd) < 6;
            } else {
                hit = camera.position.distanceTo(obs.position) < 10;
            }
            if (hit) {
                applyPenalty();
                teleportToFloor(currentLabyrinth.currentFloor);
                return;
            }
        }
    }
}

function updateFlashingBuildings(delta) {
    skyscraperMeshes.forEach(building => {
        if (building.userData.isFlashing) {
            if (Date.now() > building.userData.flashEndTime) {
                building.userData.isFlashing = false;
                building.material.emissive.copy(building.userData.originalColor);
            } else {
                building.userData.flashCooldown -= delta;
                if (building.userData.flashCooldown <= 0) {
                    building.material.emissive.setHex(Math.random() * 0xffffff);
                    building.userData.flashCooldown = 0.3;
                }
            }
        }
    });
}

export function animate() {
    requestAnimationFrame(animate);
    if (gamePaused) return;
    const delta = clock.getDelta();
    const now = performance.now();

    handleMovement(delta);
    checkProximity();
    updateObstacles(delta);

    if (session.userId && now - lastPositionUpdateTime > 250 && isCityVisible) {
         updatePlayerPosition();
         lastPositionUpdateTime = now;
    }

    otherPlayers.forEach(player => {
        if (player.targetPosition) {
            player.avatar.position.lerp(player.targetPosition, 0.1);
            player.avatar.quaternion.slerp(player.targetQuaternion, 0.1);
        }
    });

    if (isCityVisible) {
        updateDataTransfers();
        updateFlashingBuildings(delta);
        buildings.forEach(updateTexture);
    }

    composer.render();
    labelRenderer.render(scene, camera);
}

function generateMaze(w, h) { const matrix = Array(h).fill(null).map(() => Array(w).fill(1)); const path = (r, c) => { matrix[r][c] = 0; const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]].sort(() => Math.random() - 0.5); for (const [dr, dc] of dirs) { const nr = r + dr * 2; const nc = c + dc * 2; if (nr > 0 && nr < h-1 && nc > 0 && nc < w-1 && matrix[nr][nc] === 1) { matrix[r + dr][c + dc] = 0; path(nr, nc); } } }; path(1,1); if(h > 2 && w > 2) matrix[h-2][w-2] = 0; return matrix; }

// Knock out a fraction of interior walls that separate two open cells, turning the
// perfect maze (single solution path) into one with loops and alternate routes.
function braidMaze(maze, size, chance) {
    for (let i = 1; i < size - 1; i++) {
        for (let j = 1; j < size - 1; j++) {
            if (maze[i][j] !== 1) continue;
            const horizontalGap = maze[i][j-1] === 0 && maze[i][j+1] === 0;
            const verticalGap = maze[i-1][j] === 0 && maze[i+1][j] === 0;
            if ((horizontalGap !== verticalGap) && Math.random() < chance) {
                maze[i][j] = 0;
            }
        }
    }
}

function addNotoriety(amount) {
    playerState.notoriety = Math.max(0, playerState.notoriety + amount);
    let levelUp = false;
    while(playerState.notoriety >= playerState.notorietyToNextLevel) {
        levelUp = true;
        playerState.level++;
        playerState.notoriety -= playerState.notorietyToNextLevel;
        playerState.notorietyToNextLevel = Math.floor(playerState.notorietyToNextLevel * 1.5);
    }
    if(levelUp) {
        document.getElementById('player-level').textContent = `LVL ${playerState.level}`;
        const msg = document.createElement('div');
        msg.textContent = `LEVEL UP! REACHED LEVEL ${playerState.level}!`;
        msg.style.cssText = 'margin-top: 15px; color: #ff4400;';
        document.getElementById('level-message').appendChild(msg);
    }
    savePlayerState();
}

function setupAbilityControls() { abilities.scan.btn.addEventListener('click', useScan); abilities.firewall.btn.addEventListener('click', useFirewall); abilities.drain.btn.addEventListener('click', useDataDrain); abilities.ghost.btn.addEventListener('click', useGhost); abilities.listener.btn.addEventListener('click', deployListener); }
function handleCooldown(ability) { ability.lastUsed = Date.now(); ability.btn.classList.add('cooldown'); setTimeout(() => { ability.btn.classList.remove('cooldown'); }, ability.cooldown); }
function useScan() { if (Date.now() - abilities.scan.lastUsed < abilities.scan.cooldown) return; playSound('sound-scan-ping'); handleCooldown(abilities.scan); skyscraperMeshes.forEach(b => { if (b.userData.label && camera.position.distanceTo(b.position) < 1000) { b.userData.label.element.classList.add('scan-highlight'); setTimeout(() => b.userData.label.element.classList.remove('scan-highlight'), 4000); } }); }
function useFirewall() { if (Date.now() - abilities.firewall.lastUsed < abilities.firewall.cooldown || abilities.firewall.buffActive) return; playSound('sound-ui-click'); handleCooldown(abilities.firewall); abilities.firewall.buffActive = true; abilities.firewall.btn.classList.add('buff-active'); setTimeout(() => { if(abilities.firewall.buffActive) { abilities.firewall.buffActive = false; abilities.firewall.btn.classList.remove('buff-active'); } }, abilities.firewall.duration); }
function useDataDrain() { if (Date.now() - abilities.drain.lastUsed < abilities.drain.cooldown || !isCityVisible) return; playSound('sound-ui-click'); handleCooldown(abilities.drain); abilities.drain.active = true; abilities.drain.position.copy(camera.position); setTimeout(() => { abilities.drain.active = false; }, abilities.drain.duration); }
function useGhost() { if (Date.now() - abilities.ghost.lastUsed < abilities.ghost.cooldown || abilities.ghost.active) return; playSound('sound-ui-click'); handleCooldown(abilities.ghost); abilities.ghost.active = true; document.getElementById('radar').style.opacity = '0.2'; setTimeout(() => { abilities.ghost.active = false; document.getElementById('radar').style.opacity = '1'; }, abilities.ghost.duration); }

function deployListener() {
    if (Date.now() - abilities.listener.lastUsed < abilities.listener.cooldown) return;
    if (playerState.listenersAvailable <= 0) { showModal("Out of Sync", "No listeners available."); return; }
    playSound('sound-ui-click');

    let closestBuilding = null;
    let minDistance = 100;

    for (const building of skyscraperMeshes) {
        const distance = camera.position.distanceTo(building.position);
        if (distance < minDistance) {
            minDistance = distance;
            closestBuilding = building;
        }
    }

    if (closestBuilding) {
        if (closestBuilding.userData.hasListener) {
            showModal("Deployment Error", "Listener already deployed on this target.");
            return;
        }
        handleCooldown(abilities.listener);
        playerState.listenersAvailable--;
        playerState.deployedListenerCount++;

        playerState.bounties.forEach(bounty => {
            if (!bounty.completed && bounty.type === 'deploy' && playerState.deployedListenerCount >= bounty.target) {
                bounty.completed = true;
                addNotoriety(bounty.bonus);
                showModal("Bounty Complete!", `+${bounty.bonus} Bonus Notoriety!`);
                playSound('sound-bounty-complete');
            }
        });

        closestBuilding.userData.hasListener = true;
        closestBuilding.userData.isFlashing = true;
        closestBuilding.userData.flashEndTime = Date.now() + 10000;
        closestBuilding.userData.flashCooldown = 0;

        const listenerDiv = document.createElement('div');
        listenerDiv.className = 'listener-icon';
        listenerDiv.textContent = '🔊';
        const listenerObj = new CSS2DObject(listenerDiv);
        listenerObj.position.set(0, closestBuilding.geometry.parameters.height / 2 + 50, 0);
        closestBuilding.add(listenerObj);
        closestBuilding.userData.listenerIcon = listenerObj;

        savePlayerState();

    } else {
        showModal("Targeting Error", "No target in range for listener deployment.");
    }
}

function simulateHighPriorityData() {
    const buggedBuildings = skyscraperMeshes.filter(b => b.userData.hasListener && !b.userData.isHighPriority);
    if(buggedBuildings.length === 0) return;

    skyscraperMeshes.forEach(b => {
        if(b.userData.isHighPriority) {
            b.userData.isHighPriority = false;
            if(b.userData.listenerIcon) {
                b.userData.listenerIcon.element.classList.remove('high-priority');
            }
        }
    });

    const targetBuilding = buggedBuildings[Math.floor(Math.random() * buggedBuildings.length)];
    targetBuilding.userData.isHighPriority = true;
    if (targetBuilding.userData.listenerIcon) {
        targetBuilding.userData.listenerIcon.element.classList.add('high-priority');
    }

    setTimeout(() => {
        if (targetBuilding.userData) {
            targetBuilding.userData.isHighPriority = false;
            if (targetBuilding.userData.listenerIcon) {
                targetBuilding.userData.listenerIcon.element.classList.remove('high-priority');
            }
        }
    }, 10000);
}

function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight); labelRenderer.setSize(window.innerWidth, window.innerHeight); }

function setupMobileControls() {
    const joyUp = document.getElementById('joy-up');
    const joyDown = document.getElementById('joy-down');
    const joyLeft = document.getElementById('joy-left');
    const joyRight = document.getElementById('joy-right');

    const startMove = (dir, val) => (e) => { e.preventDefault(); e.stopPropagation(); moveState[dir] = val; };
    const stopMove = () => { moveState.forward = 0; moveState.right = 0; };

    joyUp.addEventListener('touchstart', startMove('forward', 1), { passive: false });
    joyDown.addEventListener('touchstart', startMove('forward', -1), { passive: false });
    joyLeft.addEventListener('touchstart', startMove('right', -1), { passive: false });
    joyRight.addEventListener('touchstart', startMove('right', 1), { passive: false });

    joyUp.addEventListener('mousedown', startMove('forward', 1));
    joyDown.addEventListener('mousedown', startMove('forward', -1));
    joyLeft.addEventListener('mousedown', startMove('right', -1));
    joyRight.addEventListener('mousedown', startMove('right', 1));

    document.addEventListener('touchend', stopMove);
    document.addEventListener('mouseup', stopMove);

    let touchLookId = null;
    let lastLookX = 0, lastLookY = 0;

    renderer.domElement.addEventListener('touchstart', (e) => {
        for (const touch of e.changedTouches) {
            if (touch.clientX > window.innerWidth / 2 && touchLookId === null) {
                e.preventDefault();
                touchLookId = touch.identifier;
                lastLookX = touch.clientX;
                lastLookY = touch.clientY;
                return;
            }
        }
    }, { passive: false });

    renderer.domElement.addEventListener('touchmove', (e) => {
         for (const touch of e.changedTouches) {
            if (touch.identifier === touchLookId) {
                e.preventDefault();
                const deltaX = touch.clientX - lastLookX;
                const deltaY = touch.clientY - lastLookY;
                lastLookX = touch.clientX;
                lastLookY = touch.clientY;

                camera.rotation.y -= deltaX * 0.002;
                camera.rotation.x -= deltaY * 0.002;
                camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
            }
        }
    }, { passive: false });

    renderer.domElement.addEventListener('touchend', (e) => {
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchLookId) {
                e.preventDefault();
                touchLookId = null;
                return;
            }
        }
    });
}

function createNetworkFloor(container, renderer) { const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#000510'; ctx.fillRect(0, 0, 1024, 1024); const gridStep = 50, pathColor = '#00ffff'; ctx.strokeStyle = pathColor; ctx.shadowColor = pathColor; ctx.lineWidth = 1; ctx.shadowBlur = 10; for (let x = 0; x < 1024; x += gridStep) { for (let y = 0; y < 1024; y += gridStep) { if (Math.random() > 0.5) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * gridStep * 2, y + (Math.random() - 0.5) * gridStep * 2); ctx.stroke(); } } } const floorTexture = new THREE.CanvasTexture(canvas); floorTexture.wrapS = THREE.RepeatWrapping; floorTexture.wrapT = THREE.RepeatWrapping; floorTexture.repeat.set(15, 15); floorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy(); const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ map: floorTexture, emissiveMap: floorTexture, emissive: 0xccffff, emissiveIntensity: 0.4, roughness: 1.0, color: 0x000000 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.5; container.add(floor); }
function generateDataTransfer() { if (!isCityVisible || skyscraperMeshes.length < 2) return; const origin = skyscraperMeshes[Math.floor(Math.random() * skyscraperMeshes.length)].position; const target = skyscraperMeshes[Math.floor(Math.random() * skyscraperMeshes.length)].position; const packetGeometry = new THREE.SphereGeometry(2.5, 8, 8); const packetMaterial = new THREE.MeshBasicMaterial({ color: skyscraperMeshes[0].material.emissive, toneMapped: false }); const packetMesh = new THREE.Mesh(packetGeometry, packetMaterial); packetMesh.position.copy(origin).y = 2; const packet = { mesh: packetMesh, origin: packetMesh.position.clone(), target: target.clone().setY(2), progress: 0, speed: 0.005 + Math.random() * 0.005 }; dataPackets.push(packet); cityGroup.add(packetMesh); }
function updateDataTransfers() { const drainAbility = abilities.drain; dataPackets.forEach((packet, i) => { let currentSpeed = packet.speed; if (drainAbility.active && packet.mesh.position.distanceTo(drainAbility.position) < 150) { currentSpeed *= 0.2; } packet.progress += currentSpeed; if (packet.progress >= 1) { cityGroup.remove(packet.mesh); packet.mesh.geometry.dispose(); packet.mesh.material.dispose(); dataPackets.splice(i, 1); } else packet.mesh.position.lerpVectors(packet.origin, packet.target, packet.progress); }); }
function createScrollingCodeTexture(colorHex) { const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'); canvas.width = 256; canvas.height = 1024; const fontSize = 16; ctx.font = `bold ${fontSize}px monospace`; const chars = '0110101101001011101010100010101010101010101'; let code = ''; for (let i = 0; i < 20000; i++) code += chars[Math.floor(Math.random() * chars.length)]; return { canvas, context: ctx, texture: new THREE.CanvasTexture(canvas), code, fontSize, color: colorHex, scrollY: 0 }; }
function updateTexture(data) { const { context, canvas, color, fontSize, code } = data; const charWidth = fontSize * 0.7, numColumns = Math.floor(canvas.width / charWidth), numRows = Math.floor(canvas.height / fontSize); context.fillStyle = '#000000'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = `#${color}`; data.scrollY = (data.scrollY + numColumns) % code.length; for (let i = 0; i < numColumns; i++) { for (let j = 0; j < numRows; j++) { const charIndex = (data.scrollY + i * numRows + j) % code.length; context.fillText(code.charAt(charIndex), i * charWidth, j * fontSize); } } data.texture.needsUpdate = true; }

const positionSync = { lastWrite: 0, lastPos: new THREE.Vector3(Infinity, Infinity, Infinity) };
function updatePlayerPosition() {
    if (!session.userId) return;
    const now = Date.now();
    const moved = camera.position.distanceToSquared(positionSync.lastPos) > 1;
    if (!moved && now - positionSync.lastWrite < 10000) return;
    positionSync.lastWrite = now;
    positionSync.lastPos.copy(camera.position);
    net.send({ t: 'pos', p: camera.position.toArray(), q: camera.quaternion.toArray() });
}

export function upsertRemotePlayer(id, playerData) {
    if (id === session.userId || !playerData) return;

    if (!otherPlayers.has(id)) {
        const playerAvatar = createPlayerAvatar(playerData);
        playerAvatar.visible = isCityVisible;
        scene.add(playerAvatar);
        otherPlayers.set(id, { avatar: playerAvatar, data: playerData, targetPosition: playerAvatar.position.clone(), targetQuaternion: new THREE.Quaternion() });
    }

    const player = otherPlayers.get(id);
    player.data = playerData;
    if(playerData.position) player.targetPosition.fromArray(playerData.position);
    if(playerData.quaternion) player.targetQuaternion.fromArray(playerData.quaternion);

    const label = player.avatar.getObjectByProperty('type', 'CSS2DObject');
    if (label) setPlayerLabel(label.element, playerData);
}

export function removePlayer(playerId) {
    if (otherPlayers.has(playerId)) {
        const player = otherPlayers.get(playerId);
        scene.remove(player.avatar);
        player.avatar.traverse(obj => {
            if(obj.geometry) obj.geometry.dispose();
            if(obj.material) obj.material.dispose();
        });
        otherPlayers.delete(playerId);
    }
}

function createPlayerAvatar(playerData) {
    const factionInfo = factions[playerData.faction] || { color: '#aaaaaa' };
    const group = new THREE.Group();

    const bodyGeo = new THREE.CapsuleGeometry(2, 6, 4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(factionInfo.color),
        emissive: new THREE.Color(factionInfo.color),
        emissiveIntensity: 0.5,
        metalness: 0.3,
        roughness: 0.6,
        transparent: true,
        opacity: 0.7
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 5;
    group.add(body);

    const labelDiv = document.createElement('div');
    labelDiv.className = 'player-label';
    setPlayerLabel(labelDiv, playerData);
    const nameLabel = new CSS2DObject(labelDiv);
    nameLabel.position.set(0, 12, 0);
    group.add(nameLabel);

    if(playerData.position) group.position.fromArray(playerData.position);
    return group;
}
