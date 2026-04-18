const axios = require('axios');

const BLOTATO_KEY = process.env.BLOTATO_API_KEY;
const BASE = 'https://api.blotato.com/v1';

const PLATFORMS = ['instagram', 'tiktok', 'linkedin', 'twitter', 'youtube', 'facebook'];

async function postContent({ text, imageUrl, videoUrl, platforms = PLATFORMS }) {
  const results = {};
  for (const platform of platforms) {
    try {
      const payload = { platform, content: { text } };
      if (imageUrl) payload.content.media = [{ type: 'image', url: imageUrl }];
      if (videoUrl) payload.content.media = [{ type: 'video', url: videoUrl }];
      const r = await axios.post(`${BASE}/posts`, payload, {
        headers: { 'Authorization': `Bearer ${BLOTATO_KEY}`, 'Content-Type': 'application/json' }
      });
      results[platform] = { ok: true, id: r.data.id };
    } catch(e) {
      results[platform] = { ok: false, error: e.response?.data?.message || e.message };
    }
  }
  return results;
}

module.exports = { postContent, PLATFORMS };
