const { spawn } = require('node-pty');
const WebSocket = require('ws');

function startKiloTerminalServer(httpServer) {
  const wss = new WebSocket.Server({ 
    server: httpServer, 
    path: '/ws/kilo-terminal' 
  });

  console.log('[KiloTerminal] WebSocket server pornit pe /ws/kilo-terminal');

  wss.on('connection', (ws, req) => {
    console.log('[KiloTerminal] Client conectat');

    // Porneste kilo CLI in PTY real
    const pty = spawn('kilo', [], {
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

    console.log('[KiloTerminal] Kilo PTY pornit, PID:', pty.pid);

    // Output PTY → Browser
    pty.onData((data) => {
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
      try { pty.kill(); } catch(e) {}
    });

    ws.on('error', (e) => {
      console.error('[KiloTerminal] WS error:', e.message);
      try { pty.kill(); } catch(e2) {}
    });
  });
}

module.exports = { startKiloTerminalServer };
