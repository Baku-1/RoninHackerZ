// End-to-end protocol test: boots the real server on a test port with an
// isolated data file, connects two simulated clients, and exercises
// hello/save/pos/chat/leaderboard/disconnect. Run with `npm test`.

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.PORT = 3555;
process.env.NHC_DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nhc-test-')), 'data.json');

const WebSocket = require('ws');
require('../server/server.js');

const URL = 'ws://127.0.0.1:3555';
const results = [];
function pass(name) { results.push(name); console.log('PASS:', name); }

function client() {
    const ws = new WebSocket(URL);
    const inbox = [];
    const waiters = [];
    ws.on('message', raw => {
        const msg = JSON.parse(raw);
        inbox.push(msg);
        waiters.forEach((w, i) => { if (w.pred(msg)) { waiters.splice(i, 1); w.resolve(msg); } });
    });
    return {
        ws, inbox,
        send: obj => ws.send(JSON.stringify(obj)),
        expect: (pred, label) => new Promise((resolve, reject) => {
            const existing = inbox.find(pred);
            if (existing) return resolve(existing);
            const timer = setTimeout(() => reject(new Error('timeout waiting for: ' + label)), 4000);
            waiters.push({ pred, resolve: m => { clearTimeout(timer); resolve(m); } });
        }),
        open: () => new Promise(res => ws.on('open', res))
    };
}

(async () => {
    // static hosting
    const res = await fetch('http://127.0.0.1:3555/');
    const html = await res.text();
    assert(res.status === 200 && html.includes('New Hack City'), 'index.html served');
    const jsRes = await fetch('http://127.0.0.1:3555/js/main.js');
    assert.strictEqual(jsRes.status, 200, 'js modules served');
    const escapeRes = await fetch('http://127.0.0.1:3555/..%2fserver%2fserver.js');
    assert.notStrictEqual(escapeRes.status, 200, 'path traversal blocked');
    pass('HTTP serves index.html and modules, blocks path traversal');

    // client A: hello + save
    const a = client();
    await a.open();
    a.send({ t: 'hello', wallet: '0xAAAA1111' });
    const welcomeA = await a.expect(m => m.t === 'welcome', 'welcome A');
    assert.strictEqual(welcomeA.id, '0xaaaa1111');
    assert.strictEqual(welcomeA.state, null, 'new player has no saved state');
    pass('hello -> welcome with null state for new player');

    a.send({ t: 'save', state: { playerName: 'Neo', faction: 'Data Kraken', infiltrations: 3, level: 2, hacked: 'ignored-field' } });
    const stateA = await a.expect(m => m.t === 'state', 'state echo');
    assert.strictEqual(stateA.state.playerName, 'Neo');
    assert.strictEqual(stateA.state.infiltrations, 3);
    assert.strictEqual(stateA.state.hacked, undefined, 'non-whitelisted field dropped');
    pass('save persists whitelisted fields and echoes state');

    // client B joins, should see A in roster; A should see B join
    const b = client();
    await b.open();
    b.send({ t: 'hello', wallet: 'ronin:bbbb2222' });
    await b.expect(m => m.t === 'welcome', 'welcome B');
    const rosterA = await b.expect(m => m.t === 'player' && m.id === '0xaaaa1111', 'B sees A');
    assert.strictEqual(rosterA.data.playerName, 'Neo');
    await a.expect(m => m.t === 'player' && m.id === 'ronin:bbbb2222', 'A sees B join');
    pass('both clients see each other in the roster');

    await b.expect(m => m.t === 'chatHistory', 'chat history');
    pass('chat history delivered on join');

    // position sync B -> A
    b.send({ t: 'pos', p: [10, 20, 30], q: [0, 0, 0, 1] });
    const posMsg = await a.expect(m => m.t === 'player' && m.id === 'ronin:bbbb2222' && m.data.position && m.data.position[0] === 10, 'pos broadcast');
    assert.deepStrictEqual(posMsg.data.position, [10, 20, 30]);
    pass('position sync broadcasts to other players');

    // chat both directions (sender included)
    a.send({ t: 'chat', message: 'hello world' });
    const chatB = await b.expect(m => m.t === 'chat', 'chat to B');
    const chatA = await a.expect(m => m.t === 'chat', 'chat echo to A');
    assert.strictEqual(chatB.msg.playerName, 'Neo');
    assert(chatB.msg.message.includes('hello world'));
    assert.strictEqual(chatA.msg.message, chatB.msg.message);
    pass('chat broadcast reaches everyone including sender');

    // leaderboard
    b.send({ t: 'leaderboard', reqId: 7 });
    const lb = await b.expect(m => m.t === 'leaderboard' && m.reqId === 7, 'leaderboard');
    assert.strictEqual(lb.top[0].name, 'Neo');
    assert.strictEqual(lb.top[0].score, 3);
    pass('leaderboard returns ranked players with scores');

    // disconnect broadcast
    b.ws.close();
    await a.expect(m => m.t === 'playerLeft' && m.id === 'ronin:bbbb2222', 'playerLeft');
    pass('disconnect broadcasts playerLeft');

    // reconnect restores saved state
    const a2 = client();
    await a2.open();
    a2.send({ t: 'hello', wallet: '0xAAAA1111' });
    const welcomeA2 = await a2.expect(m => m.t === 'welcome', 'welcome A2');
    assert.strictEqual(welcomeA2.state.playerName, 'Neo');
    assert.strictEqual(welcomeA2.state.level, 2);
    pass('reconnect restores persisted state (and kicks old session)');

    console.log(`\nALL ${results.length} PROTOCOL TESTS PASSED`);
    process.exit(0);
})().catch(err => {
    console.error('TEST FAILED:', err.message);
    process.exit(1);
});
