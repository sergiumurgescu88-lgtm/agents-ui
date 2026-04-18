const fs = require('fs');
const path = require('path');
const https = require('https');

const GENERATED_DIR = '/opt/agents-ui/public/generated';
fs.mkdirSync(GENERATED_DIR, { recursive: true });

async function geminiPost(model, body) {
  const key = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Gemini ${model} error: ${await res.text()}`);
  return res.json();
}

async function generateCaption(topic, platform) {
  const data = await geminiPost('gemini-2.5-flash', {
    contents: [{ parts: [{ text: `Scrie un caption ${platform} viral in romana pentru: ${topic}. Max 300 chars. Include hashtag-uri.` }] }]
  });
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function generateImage(prompt) {
  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const r = await ai.models.generateImages({
      model: 'imagen-4.0-ultra-generate-001',
      prompt,
      config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '1:1' }
    });
    const img = r.generatedImages?.[0];
    if (!img?.image?.imageBytes) return null;
    const fname = `img_${Date.now()}.jpg`;
    fs.writeFileSync(path.join(GENERATED_DIR, fname), Buffer.from(img.image.imageBytes, 'base64'));
    return `/generated/${fname}`;
  } catch(e) { console.error('[Image]', e.message); return null; }
}

async function generateTTS(text, voiceName = 'Zephyr') {
  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const chunks = [];
    let mimeType = 'audio/L16;rate=24000';
    const stream = await ai.models.generateContentStream({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ role: 'user', parts: [{ text }] }],
      config: { responseModalities: ['audio'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } }
    });
    for await (const chunk of stream) {
      const part = chunk.candidates?.[0]?.content?.parts?.[0];
      if (part?.inlineData?.data) {
        chunks.push(Buffer.from(part.inlineData.data, 'base64'));
        mimeType = part.inlineData.mimeType || mimeType;
      }
    }
    if (!chunks.length) return null;
    const fname = `tts_${Date.now()}.wav`;
    fs.writeFileSync(path.join(GENERATED_DIR, fname), toWav(Buffer.concat(chunks), mimeType));
    return `/generated/${fname}`;
  } catch(e) { console.error('[TTS]', e.message); return null; }
}

function toWav(audioData, mimeType) {
  let rate = 24000, bits = 16;
  for (const p of mimeType.split(';')) {
    const t = p.trim();
    if (t.startsWith('rate=')) rate = parseInt(t.split('=')[1]) || rate;
    if (t.includes('/L')) { try { bits = parseInt(t.split('L')[1]); } catch{} }
  }
  const buf = Buffer.alloc(44 + audioData.length);
  buf.write('RIFF',0); buf.writeUInt32LE(36+audioData.length,4);
  buf.write('WAVE',8); buf.write('fmt ',12);
  buf.writeUInt32LE(16,16); buf.writeUInt16LE(1,20); buf.writeUInt16LE(1,22);
  buf.writeUInt32LE(rate,24); buf.writeUInt32LE(rate*bits/8,28);
  buf.writeUInt16LE(bits/8,32); buf.writeUInt16LE(bits,34);
  buf.write('data',36); buf.writeUInt32LE(audioData.length,40);
  audioData.copy(buf,44);
  return buf;
}

async function generateMusic(prompt) {
  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const chunks = [];
    let ext = '.wav';
    const stream = await ai.models.generateContentStream({
      model: 'lyria-3-pro-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseModalities: ['audio'] }
    });
    for await (const chunk of stream) {
      const part = chunk.candidates?.[0]?.content?.parts?.[0];
      if (part?.inlineData?.data) {
        chunks.push(Buffer.from(part.inlineData.data, 'base64'));
        if ((part.inlineData.mimeType||'').includes('mp3')) ext = '.mp3';
      }
    }
    if (!chunks.length) return null;
    const fname = `music_${Date.now()}${ext}`;
    fs.writeFileSync(path.join(GENERATED_DIR, fname), Buffer.concat(chunks));
    return `/generated/${fname}`;
  } catch(e) { console.error('[Music]', e.message); return null; }
}

async function generateVideo(prompt) {
  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: 'v1beta' } });
    let op = await ai.models.generateVideos({
      model: 'veo-3.1-lite-generate-preview',
      source: { prompt },
      config: { personGeneration: 'dont_allow', aspectRatio: '16:9', numberOfVideos: 1, durationSeconds: 8, resolution: '720p' }
    });
    let attempts = 0;
    while (!op.done && attempts < 30) {
      await new Promise(r => setTimeout(r, 10000));
      op = await ai.operations.get(op);
      attempts++;
    }
    const vid = op.result?.generatedVideos?.[0];
    if (!vid?.video?.uri) return null;
    const fname = `video_${Date.now()}.mp4`;
    await downloadFile(vid.video.uri + `&key=${process.env.GEMINI_API_KEY}`, path.join(GENERATED_DIR, fname));
    return `/generated/${fname}`;
  } catch(e) { console.error('[Video]', e.message); return null; }
}

function downloadFile(url, dest) {
  return new Promise((res, rej) => {
    const f = fs.createWriteStream(dest);
    https.get(url, r => { r.pipe(f); f.on('finish', () => { f.close(); res(); }); }).on('error', rej);
  });
}

module.exports = { generateImage, generateTTS, generateMusic, generateVideo, generateCaption };
