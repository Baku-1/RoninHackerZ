// New Hack City game server.
// Serves index.html and runs the realtime WebSocket backend that replaced Firebase:
// player state persistence, position sync, world chat, and the leaderboard.
//
// Persistence is a debounced JSON file (server/data.json) — deliberately simple for
// the pre-alpha. The store access is isolated so it can be swapped for SQLite or
// Postgres without touching the protocol.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.NHC_DATA_FILE || path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const CHAT_HISTORY_LIMIT = 100;
const CHAT_MESSAGE_MAX_LENGTH = 200;
const PLAYER_NAME_MAX_LENGTH = 24;
const POS_MIN_INTERVAL_MS = 100;

// Only fields the client legitimately owns are persisted from a save message.
const SAVEABLE_FIELDS = [
    'level', 'notoriety', 'notorietyToNextLevel', 'listenersAvailable',
    'deployedListenerCount', 'infiltrations', 'nxs', 'codeFragments',
    'bounties', 'playerName', 'faction', 'walletAddress'
];

// ---- persistence ----
let store = { players: {}, chat: [] };
try {
    store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    store.players = store.players || {};
    store.chat = store.chat || [];
} catch {
    // first run: start with an empty store
}

let saveTimer = null;
function persist() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        fs.writeFile(DATA_FILE, JSON.stringify(store), (err) => {
            if (err) console.error('Failed to persist store:', err);
        });
    }, 2000);
}

// ---- static hosting ----
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    if (req.method !== 'GET') { res.writeHead(405); res.end('method not allowed'); return; }
    let urlPath;
    try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400); res.end('bad request'); return; }
    const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const filePath = path.normalize(path.join(PUBLIC_DIR, relPath));
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(filePath, (err, buf) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(buf);
    });
});

// ---- realtime ----
const wss = new WebSocketServer({ server });
const live = new Map(); // playerId -> { ws, position, quaternion }

function send(ws, obj) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj, exceptId) {
    const raw = JSON.stringify(obj);
    live.forEach((entry, id) => {
        if (id !== exceptId && entry.ws.readyState === entry.ws.OPEN) entry.ws.send(raw);
    });
}

function publicProfile(id) {
    const saved = store.players[id] || {};
    const session = live.get(id) || {};
    return {
        playerName: saved.playerName || 'Hacker',
        faction: saved.faction || 'Unassigned',
        infiltrations: saved.infiltrations || 0,
        position: session.position || null,
        quaternion: session.quaternion || null
    };
}

wss.on('connection', (ws) => {
    const ctx = { id: null, lastPosTime: 0 };

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        if (!msg || typeof msg.t !== 'string') return;

        if (msg.t === 'hello') {
            // NOTE: identity is the self-reported wallet address — the same trust
            // level as the anonymous Firebase auth it replaced. Signature-based
            // verification (sign a server nonce) is the planned upgrade before
            // anything of value is attached to an account.
            const wallet = String(msg.wallet || '').toLowerCase().slice(0, 64);
            if (!/^[a-z0-9:x]{4,64}$/.test(wallet)) {
                send(ws, { t: 'error', message: 'invalid wallet' });
                return;
            }
            // one live session per wallet: replace any previous connection
            const existing = live.get(wallet);
            if (existing && existing.ws !== ws) {
                try { existing.ws.close(); } catch { /* already gone */ }
            }
            ctx.id = wallet;
            live.set(wallet, { ws, position: null, quaternion: null });

            send(ws, { t: 'welcome', id: wallet, state: store.players[wallet] || null });
            live.forEach((entry, id) => {
                if (id !== wallet) send(ws, { t: 'player', id, data: publicProfile(id) });
            });
            send(ws, { t: 'chatHistory', msgs: store.chat.slice(-50) });
            broadcast({ t: 'player', id: wallet, data: publicProfile(wallet) }, wallet);
            return;
        }

        if (!ctx.id) return; // everything below requires a completed hello

        if (msg.t === 'save' && msg.state && typeof msg.state === 'object') {
            const saved = store.players[ctx.id] || (store.players[ctx.id] = {});
            for (const field of SAVEABLE_FIELDS) {
                if (field in msg.state) saved[field] = msg.state[field];
            }
            if (typeof saved.playerName === 'string') {
                saved.playerName = saved.playerName.slice(0, PLAYER_NAME_MAX_LENGTH);
            }
            persist();
            send(ws, { t: 'state', state: saved });
            broadcast({ t: 'player', id: ctx.id, data: publicProfile(ctx.id) }, ctx.id);
            return;
        }

        if (msg.t === 'pos') {
            const now = Date.now();
            if (now - ctx.lastPosTime < POS_MIN_INTERVAL_MS) return;
            ctx.lastPosTime = now;
            const entry = live.get(ctx.id);
            if (!entry || entry.ws !== ws) return;
            if (Array.isArray(msg.p) && msg.p.length === 3 && msg.p.every(Number.isFinite)) entry.position = msg.p;
            if (Array.isArray(msg.q) && msg.q.length === 4 && msg.q.every(Number.isFinite)) entry.quaternion = msg.q;
            broadcast({ t: 'player', id: ctx.id, data: publicProfile(ctx.id) }, ctx.id);
            return;
        }

        if (msg.t === 'chat') {
            const text = String(msg.message || '').slice(0, CHAT_MESSAGE_MAX_LENGTH).trim();
            if (!text) return;
            const saved = store.players[ctx.id] || {};
            const chatMsg = {
                playerName: saved.playerName || 'Hacker',
                faction: saved.faction || 'Unassigned',
                message: text,
                ts: Date.now()
            };
            store.chat.push(chatMsg);
            if (store.chat.length > CHAT_HISTORY_LIMIT) store.chat = store.chat.slice(-CHAT_HISTORY_LIMIT);
            persist();
            broadcast({ t: 'chat', msg: chatMsg }); // includes the sender
            return;
        }

        if (msg.t === 'leaderboard') {
            let total = 0;
            let count = 0;
            const ranked = Object.values(store.players).map(p => {
                const score = p.infiltrations || 0;
                total += score;
                count++;
                return { name: p.playerName || 'Hacker', score };
            });
            ranked.sort((a, b) => b.score - a.score);
            send(ws, {
                t: 'leaderboard',
                reqId: msg.reqId,
                top: ranked.slice(0, 10),
                average: count > 0 ? total / count : 0
            });
        }
    });

    ws.on('close', () => {
        if (ctx.id && live.get(ctx.id)?.ws === ws) {
            live.delete(ctx.id);
            broadcast({ t: 'playerLeft', id: ctx.id });
        }
    });
});

process.on('SIGINT', () => {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(store)); } catch { /* best effort */ }
    process.exit(0);
});

server.listen(PORT, () => {
    console.log(`New Hack City server running at http://localhost:${PORT}`);
});
