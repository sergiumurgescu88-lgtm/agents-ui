const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const fs = require('fs');

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
    if (!img) return null;
    const path = `/opt/agents-ui/public/generated/img_${Date.now()}.jpg`;
    fs.mkdirSync('/opt/agents-ui/public/generated', { recursive: true });
    img.image.save(path);
    return `/generated/img_${Date.now()}.jpg`;
  } catch(e) {
    console.error('[Gemini Image]', e.message);
    return null;
  }
}

async function generateCaption(topic, platform) {
  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const prompt = `Scrie un caption ${platform} viral în română pentru: ${topic}. Max 300 chars. Include hashtag-uri relevante.`;
  const r = await model.generateContent(prompt);
  return r.response.text();
}

module.exports = { generateImage, generateCaption };
