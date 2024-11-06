const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const PORT = process.env.PORT || 3000;

const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// إعداد Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

const bones = [
    { name: 'Clavicule', id: 'Clavicule' },
    { name: 'Scapula', id: 'Scapula' },
    { name: 'Humerus', id: 'Humerus' },
    { name: 'Ulna', id: 'Ulna' },
    { name: 'Radius', id: 'Radius' },
    { name: 'Os coxal', id: 'Os coxal' },
    { name: 'Fémur', id: 'Fémur' },
    { name: 'Patella', id: 'Patella' },
    { name: 'Tibia', id: 'Tibia' },
    { name: 'Fibula', id: 'Fibula' },
];

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const options = {
        reply_markup: {
            inline_keyboard: bones.map(bone => [{ text: bone.name, callback_data: bone.id }])
        }
    };
    bot.sendMessage(chatId, 'Choisissez un os pour en savoir plus :', options);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const boneId = query.data;

    try {
        const prompt = `Donner une Definition, une Description, une Orientation, une Situation, et une Repères palpables de : ${boneId}.`;
        
        const result = await model.generateContent(prompt);

        // الوصول إلى النص داخل `candidates[0].content.parts[0].text`
        if (result && result.response && result.response.candidates &&
            result.response.candidates[0].content && result.response.candidates[0].content.parts &&
            result.response.candidates[0].content.parts[0].text) {
                
            const description = result.response.candidates[0].content.parts[0].text.trim();
            bot.sendMessage(chatId, `${boneId}: ${description}`);
            bot.deleteMessage(chatId, messageId);
        } else {
            bot.sendMessage(chatId, 'عذرًا، لم أتمكن من جلب وصف العظمة المطلوبة.');
            bot.deleteMessage(chatId, messageId);
        }
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'عذرًا، حدث خطأ أثناء جلب المعلومات. حاول مرة أخرى لاحقًا.');
        bot.deleteMessage(chatId, messageId);
    }
});

console.log("Bot is running...");