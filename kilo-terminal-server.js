const { spawn } = require('node-pty');
const WebSocket = require('ws');
const ssh2 = require('ssh2');
const kiloSessions = new Map();

function getKiloSession(userId) { return kiloSessions.get(userId) || null; }

function runCommandInKilo(userId, command) {
  return new Promise((resolve) => {
    const session = kiloSessions.get(userId);
    if (!session || !session.write) return resolve('❌ Kilo nu e conectat');
    let output = '';
    const timeout = setTimeout(() => resolve(output || '(timeout)'), 15000);
    session.onOutput = (data) => {
      output += data;
      if (data.includes('$') || data.includes('#') || data.includes('error')) {
        clearTimeout(timeout); session.onOutput = null; resolve(output);
      }
    };
    session.write(command + '\n');
  });
}

function startKiloTerminalServer(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws/kilo-terminal' });
  console.log('[KiloTerminal] WebSocket server pornit pe /ws/kilo-terminal');

  wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams((req.url.split('?')[1]) || '');
    const userId = urlParams.get('userId') || 'anonymous';
    console.log('[KiloTerminal] Client conectat, userId:', userId);

    let session = null; // { write, resize, kill }
    let configured = false;

    function startLocalBash() {
      console.log('[KiloTerminal] Pornire bash local');
      const pty = spawn('bash', [], {
        name: 'xterm-256color', cols: 120, rows: 35, cwd: '/root',
        env: { ...process.env, HOME: '/root', TERM: 'xterm-256color' }
      });
      pty.onData((data) => {
        const s = kiloSessions.get(userId);
        if (s && s.onOutput) s.onOutput(data);
        try { ws.send(JSON.stringify({ type: 'output', data })); } catch(e) {}
      });
      pty.onExit(({ exitCode }) => {
        console.log('[KiloTerminal] Bash exit:', exitCode);
        try { ws.send(JSON.stringify({ type: 'exit', code: exitCode })); ws.close(); } catch(e) {}
      });
      session = {
        write: (d) => pty.write(d),
        resize: (c, r) => pty.resize(c, r),
        kill: () => { try { pty.kill(); } catch(e) {} },
        onOutput: null
      };
      kiloSessions.set(userId, session);
    }

    function startSSH(cfg) {
      console.log('[KiloTerminal] Pornire SSH →', cfg.username + '@' + cfg.host + ':' + (cfg.port||22));
      const conn = new ssh2.Client();
      conn.on('ready', () => {
        console.log('[KiloTerminal] SSH conectat la', cfg.host);
        conn.shell({ term: 'xterm-256color', cols: 120, rows: 35 }, (err, stream) => {
          if (err) {
            console.error('[KiloTerminal] SSH shell error:', err.message);
            try { ws.send(JSON.stringify({ type: 'output', data: '❌ SSH shell error: ' + err.message + '\r\n' })); } catch(e) {}
            conn.end(); return;
          }
          stream.on('data', (data) => {
            const s = kiloSessions.get(userId);
            if (s && s.onOutput) s.onOutput(data.toString());
            try { ws.send(JSON.stringify({ type: 'output', data: data.toString() })); } catch(e) {}
          });
          stream.on('close', () => {
            console.log('[KiloTerminal] SSH stream închis');
            conn.end();
            try { ws.send(JSON.stringify({ type: 'exit', code: 0 })); ws.close(); } catch(e) {}
          });
          session = {
            write: (d) => { try { stream.write(d); } catch(e) {} },
            resize: (c, r) => { try { stream.setWindow(r, c, 0, 0); } catch(e) {} },
            kill: () => { try { stream.close(); conn.end(); } catch(e) {} },
            onOutput: null
          };
          kiloSessions.set(userId, session);
        });
      });
      conn.on('error', (err) => {
        console.error('[KiloTerminal] SSH error:', err.message);
        try { ws.send(JSON.stringify({ type: 'output', data: '❌ SSH eroare: ' + err.message + '\r\n' })); } catch(e) {}
        // Fallback la bash local
        startLocalBash();
      });
      conn.connect({
        host: cfg.host,
        port: cfg.port || 22,
        username: cfg.username || 'root',
        password: cfg.password,
        readyTimeout: 15000,
        keepaliveInterval: 10000
      });
    }

    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg);

        if (parsed.type === 'config' && !configured) {
          configured = true;
          if (parsed.vps && parsed.vps.host && parsed.vps.password) {
            startSSH(parsed.vps);
          } else {
            startLocalBash();
          }
          return;
        }

        if (!configured) { configured = true; startLocalBash(); }
        if (!session) return;

        if (parsed.type === 'input') session.write(parsed.data);
        else if (parsed.type === 'inject') session.write(parsed.data + '\n');
        else if (parsed.type === 'resize') session.resize(
          Math.max(1, parseInt(parsed.cols) || 120),
          Math.max(1, parseInt(parsed.rows) || 35)
        );
      } catch(e) {
        if (session) session.write(msg.toString());
      }
    });

    ws.on('close', () => {
      console.log('[KiloTerminal] Client deconectat');
      if (session) session.kill();
      kiloSessions.delete(userId);
    });

    ws.on('error', (e) => {
      console.error('[KiloTerminal] WS error:', e.message);
      if (session) session.kill();
    });
  });
}

module.exports = { startKiloTerminalServer, getKiloSession, runCommandInKilo, kiloSessions };
