const { spawn } = require('node-pty');
const WebSocket = require('ws');

const kiloSessions = new Map();
function getKiloSession(userId) { return kiloSessions.get(userId) || null; }
function runCommandInKilo(userId, command) {
  return new Promise((resolve) => {
    const session = kiloSessions.get(userId);
    if (!session || !session.pty) return resolve('❌ Kilo nu e conectat');
    let output = '';
    const timeout = setTimeout(() => resolve(output || '(timeout)'), 15000);
    session.onOutput = (data) => {
      output += data;
      if (data.includes('$') || data.includes('>') || data.includes('✓') || data.includes('error')) {
        clearTimeout(timeout); session.onOutput = null; resolve(output);
      }
    };
    session.pty.write(command + '\n');
  });
}

function startKiloTerminalServer(httpServer) {
  const wss = new WebSocket.Server({ 
    server: httpServer, 
    path: '/ws/kilo-terminal' 
  });

  console.log('[KiloTerminal] WebSocket server pornit pe /ws/kilo-terminal');

  wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams((req.url.split('?')[1])||'');
    const userId = urlParams.get('userId') || 'anonymous';
    console.log('[KiloTerminal] Client conectat, userId:', userId);

    // Porneste bash in PTY real
    const pty = spawn('bash', [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 35,
      cwd: '/root',
      env: { 
        ...process.env, 
        HOME: '/root',
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      }
    });

    console.log('[KiloTerminal] Bash PTY pornit, PID:', pty.pid);
    kiloSessions.set(userId, { pty, onOutput: null, ws });

    // Output PTY → Browser
    pty.onData((data) => {
      const s = kiloSessions.get(userId); if (s && s.onOutput) s.onOutput(data);
      try { ws.send(JSON.stringify({ type: 'output', data })); } catch(e) {}
    });

    pty.onExit(({ exitCode }) => {
      console.log('[KiloTerminal] Kilo exit:', exitCode);
      try { 
        ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
        ws.close();
      } catch(e) {}
    });

    // Input Browser → PTY
    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type === 'input') {
          pty.write(parsed.data);
        } else if (parsed.type === 'resize') {
          pty.resize(
            Math.max(1, parseInt(parsed.cols) || 120),
            Math.max(1, parseInt(parsed.rows) || 35)
          );
        } else if (parsed.type === 'inject') {
          // Trimite prompt direct in kilo
          pty.write(parsed.data + '\n');
        }
      } catch(e) {
        // Input raw
        pty.write(msg.toString());
      }
    });

    ws.on('close', () => {
      console.log('[KiloTerminal] Client deconectat');
      kiloSessions.delete(userId);
      try { pty.kill(); } catch(e) {}
    });

    ws.on('error', (e) => {
      console.error('[KiloTerminal] WS error:', e.message);
      try { pty.kill(); } catch(e2) {}
    });
  });
}

module.exports = { startKiloTerminalServer, getKiloSession, runCommandInKilo, kiloSessions };
