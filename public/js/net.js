// WebSocket connection to the game server (server/server.js). The server serves
// this page, so it's always reachable at the page's own host.
//
// Message flow: connect() resolves on the server's welcome; responses to
// request() are matched by reqId; everything else is dispatched to handlers
// registered with net.on(type, fn).

export const net = {
    ws: null,
    reqId: 0,
    pending: new Map(),
    handlers: {},

    on(type, fn) { this.handlers[type] = fn; },

    connect(wallet) {
        return new Promise((resolve, reject) => {
            const proto = location.protocol === 'https:' ? 'wss' : 'ws';
            const ws = new WebSocket(`${proto}://${location.host}`);
            const timeout = setTimeout(() => { ws.close(); reject(new Error('Game server connection timed out.')); }, 8000);
            ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', wallet }));
            ws.onmessage = (event) => {
                let msg;
                try { msg = JSON.parse(event.data); } catch { return; }
                if (msg.t === 'welcome') {
                    clearTimeout(timeout);
                    this.ws = ws;
                    resolve(msg);
                    return;
                }
                if (msg.reqId && this.pending.has(msg.reqId)) {
                    const pendingResolve = this.pending.get(msg.reqId);
                    this.pending.delete(msg.reqId);
                    pendingResolve(msg);
                    return;
                }
                const handler = this.handlers[msg.t];
                if (handler) handler(msg);
            };
            ws.onerror = () => { clearTimeout(timeout); reject(new Error('Could not reach the game server.')); };
            ws.onclose = () => {
                const wasConnected = this.ws === ws;
                this.ws = null;
                if (wasConnected && this.handlers.disconnect) this.handlers.disconnect();
            };
        });
    },

    send(obj) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj)); },

    request(t, extra = {}) {
        return new Promise((resolve) => {
            const reqId = ++this.reqId;
            this.pending.set(reqId, resolve);
            this.send({ t, reqId, ...extra });
        });
    }
};
