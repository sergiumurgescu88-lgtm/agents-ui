const express = require('express');
const router = express.Router();
const pipeline = require('./pipeline');
const blotato = require('./blotato');
const creator = require('./gemini-creator');

// Salvează pas
router.post('/pipeline/save', (req, res) => {
  const { userId, step, data } = req.body;
  let sessionId = req.body.sessionId;
  if (!sessionId) sessionId = pipeline.createSession(userId);
  pipeline.saveStep(sessionId, step, data);
  res.json({ ok: true, sessionId });
});

// Obține sesiune
router.get('/pipeline/session/:id', (req, res) => {
  const steps = pipeline.getSession(req.params.id);
  res.json({ steps });
});

// Sesiuni user
router.get('/pipeline/sessions/:userId', (req, res) => {
  const sessions = pipeline.getUserSessions(req.params.userId);
  res.json({ sessions });
});

// Generator content Gemini
router.post('/pipeline/create', async (req, res) => {
  const { topic, platform, sessionId, userId } = req.body;
  try {
    const caption = await creator.generateCaption(topic, platform || 'instagram');
    const imageUrl = await creator.generateImage(topic);
    const data = { caption, imageUrl, topic, platform };
    let sid = sessionId;
    if (!sid) sid = pipeline.createSession(userId);
    pipeline.saveStep(sid, 'creator', data);
    res.json({ ok: true, sessionId: sid, caption, imageUrl });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Postează pe Blotato
router.post('/pipeline/post', async (req, res) => {
  const { sessionId, userId, platforms } = req.body;
  try {
    const creatorData = pipeline.getStepData(sessionId, 'creator');
    const marketingData = pipeline.getStepData(sessionId, 'marketing');
    const text = marketingData?.copy || creatorData?.caption || '';
    const imageUrl = creatorData?.imageUrl || null;
    const results = await blotato.postContent({ text, imageUrl, platforms });
    pipeline.saveStep(sessionId, 'hustle', { results, postedAt: new Date().toISOString() });
    res.json({ ok: true, results });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
