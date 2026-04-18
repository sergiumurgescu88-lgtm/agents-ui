const Database = require('better-sqlite3');
const db = new Database('/opt/agents-ui/pipeline.db');

function createSession(userId) {
  const stmt = db.prepare('INSERT INTO sessions (user_id) VALUES (?)');
  return stmt.run(userId).lastInsertRowid;
}

function saveStep(sessionId, step, data) {
  const stmt = db.prepare(`
    INSERT INTO pipeline_steps (session_id, step, data, status)
    VALUES (?, ?, ?, 'done')
    ON CONFLICT DO NOTHING
  `);
  db.prepare('INSERT OR REPLACE INTO pipeline_steps (session_id, step, data, status) VALUES (?,?,?,?)').run(sessionId, step, JSON.stringify(data), 'done');
  db.prepare('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
}

function getSession(sessionId) {
  const steps = db.prepare('SELECT * FROM pipeline_steps WHERE session_id = ? ORDER BY id').all(sessionId);
  return steps.map(s => ({ ...s, data: JSON.parse(s.data) }));
}

function getStepData(sessionId, step) {
  const row = db.prepare('SELECT data FROM pipeline_steps WHERE session_id = ? AND step = ?').get(sessionId, step);
  return row ? JSON.parse(row.data) : null;
}

function getUserSessions(userId) {
  return db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20').all(userId);
}

module.exports = { createSession, saveStep, getSession, getStepData, getUserSessions };
