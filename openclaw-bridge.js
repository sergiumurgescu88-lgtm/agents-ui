const { execSync } = require('child_process');

function runOpenClaw(task) {
  try {
    const escaped = task.replace(/"/g, '\\"').replace(/\$/g, '\\$').substring(0, 800);
    const result = execSync(
      `docker exec openclaw-jwzt-openclaw-1 openclaw agent --message "${escaped}" --agent main --json`,
      { timeout: 120000, encoding: 'utf8' }
    );
    const json = JSON.parse(result);
    return json?.result?.payloads?.[0]?.text || json?.result?.finalAssistantVisibleText || '❌ Răspuns gol';
  } catch(e) {
    return '❌ OpenClaw error: ' + e.message.substring(0, 200);
  }
}

module.exports = { runOpenClaw };
