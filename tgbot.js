require('dotenv').config({ path: '/opt/tgbot/.env' });
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const BUDDY_URL = 'http://localhost:7900/api/chat';
const userSessions = {};

console.log('🤖 Buddy TG Bot pornit...');

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const userId = 'tg_' + chatId;

  if (text === '/start') {
    return bot.sendMessage(chatId,
      '👋 Salut! Sunt *Buddy* — AI-ul tău de coding și business.\n\n' +
      'Scrie-mi orice:\n• Idei de business\n• Cod și automatizări\n• Marketing și strategie\n\n' +
      '_Mesaje gratuite: 100 · Premium: $9/lună_',
      { parse_mode: 'Markdown' }
    );
  }

  if (text === '/reset') {
    userSessions[userId] = [];
    return bot.sendMessage(chatId, '🔄 Conversație resetată.');
  }

  if (!userSessions[userId]) userSessions[userId] = [];

  const typing = setInterval(() => bot.sendChatAction(chatId, 'typing'), 4000);
  bot.sendChatAction(chatId, 'typing');

  try {
    userSessions[userId].push({ role: 'user', content: text });
    if (userSessions[userId].length > 20) userSessions[userId] = userSessions[userId].slice(-20);

    const res = await axios.post(BUDDY_URL, {
      messages: userSessions[userId],
      userId
    }, { timeout: 45000 });

    clearInterval(typing);
    const reply = res.data?.reply || res.data?.text || '❌ Buddy nu a răspuns';
    userSessions[userId].push({ role: 'assistant', content: reply });

    // Curata HTML/markdown incompatibil cu Telegram
    const clean = reply
      .replace(/<[^>]+>/g, '')
      .replace(/```[\s\S]*?```/g, (m) => m)
      .substring(0, 4000);

    await bot.sendMessage(chatId, clean, { parse_mode: 'Markdown' })
      .catch(() => bot.sendMessage(chatId, clean.replace(/[*_`[\]()]/g, '\\$&')));

  } catch(e) {
    clearInterval(typing);
    console.error('[TGBot]', e.message);
    bot.sendMessage(chatId, '⚠️ Eroare temporară. Încearcă din nou.');
  }
});

bot.on('polling_error', (e) => console.error('[Polling]', e.message));
