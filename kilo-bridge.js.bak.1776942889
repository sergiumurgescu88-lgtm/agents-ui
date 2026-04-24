const axios = require('axios');
const { NodeSSH } = require('ssh2') || {};
const ssh2 = require('ssh2');

// ── Direct OpenAI call (fast, no CLI overhead) ──────────────────────────────
async function kiloChat(prompt, systemPrompt) {
  try {
    console.log('[Kilo] → gpt-4.1-mini API...');
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });
    const r = await axios.post('https://api.openai.com/v1/chat/completions',
      { model: 'gpt-4.1-mini', messages, max_tokens: 4096 },
      { headers: { 'Content-Type': 'application/json',
                   'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        timeout: 30000 }
    );
    const reply = r.data?.choices?.[0]?.message?.content;
    if (reply) { console.log('[Kilo] OK'); return reply; }
    return null;
  } catch(e) {
    console.error('[Kilo] failed:', e.response?.data?.error?.message || e.message);
    return null;
  }
}

// ── SSH Executor: conectare la VPS remote + rulare comenzi ──────────────────
function sshExecuteStream(config, commands, onData, onDone, onError) {
  const conn = new ssh2.Client();

  conn.on('ready', () => {
    onData('status', `✅ Conectat la ${config.host}\n`);

    const cmdString = Array.isArray(commands) ? commands.join(' && ') : commands;
    onData('status', `🚀 Rulare: ${cmdString.substring(0, 80)}...\n`);

    conn.exec(cmdString, { pty: true }, (err, stream) => {
      if (err) { onError(err.message); conn.end(); return; }

      stream.on('data', (data) => onData('token', data.toString()));
      stream.stderr.on('data', (data) => onData('stderr', data.toString()));
      stream.on('close', (code) => {
        onData('status', `\n✅ Comanda finalizată (exit: ${code})\n`);
        conn.end();
        onDone();
      });
    });
  });

  conn.on('error', (err) => {
    onError(`❌ SSH Error: ${err.message}`);
  });

  conn.connect({
    host: config.host,
    port: config.port || 22,
    username: config.username,
    password: config.password,
    readyTimeout: 15000,
  });
}

// ── Kilo AI → generează comenzi pentru un task ─────────────────────────────
async function kiloGenerateCommands(task, context) {
  const systemPrompt = `Ești un expert DevOps/Linux. 
Generezi DOAR comenzi bash gata de rulat pe Ubuntu, fără explicații.
Returnezi un JSON: { "commands": ["cmd1", "cmd2", ...], "description": "ce face" }
Maxim 5 comenzi per răspuns. Comenzile trebuie să fie safe și reversibile.`;

  const userPrompt = `Task: ${task}\nContext server: ${context || 'Ubuntu 24.04 LTS'}`;

  try {
    const r = await axios.post('https://api.openai.com/v1/chat/completions',
      { model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1024,
        response_format: { type: 'json_object' }
      },
      { headers: { 'Content-Type': 'application/json',
                   'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        timeout: 20000 }
    );
    const content = r.data?.choices?.[0]?.message?.content;
    return JSON.parse(content);
  } catch(e) {
    console.error('[KiloGenerate] Error:', e.message);
    return null;
  }
}

module.exports = { kiloChat, sshExecuteStream, kiloGenerateCommands };
