const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

const Anatomie = {
    Osteologie: [
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
    ],
    Arthrologie: [ 
        { name: 'Articulation Sterno-Costo-Claviculaire', id: 'Sterno-Costo-Claviculaire' },
        { name: 'Articulation Acromio-Claviculaire', id: 'Acromio-Claviculaire' },
        { name: 'Articulation Scapulo-Humérale', id: 'Scapulo-Humérale' },
        { name: 'Articulation Humero-Ulnaire', id: 'Humero-Ulnaire' },
        { name: 'Articulation Humero-Radiale', id: 'Humero-Radiale' },
        { name: 'Articulation Radio-Ulnaire proximale', id: 'Radio-Ulnaire proximale' },
        { name: 'Articulation Radio-Carpienne', id: 'Radio-Carpienne' },
        { name: 'Articulation Radio-Ulnaire distale', id: 'Radio-Ulnaire distale' },
        { name: 'Articulation Coxo-Fémorale', id: 'Coxo-Fémorale' },
        { name: 'Articulation du Genou', id: 'Genou' },
        { name: 'Articulation Tibio-Fibulaire proximale', id: 'Tibio-Fibulaire proximale' },
        { name: 'Articulation Tibio-Fibulaire distale', id: 'Tibio-Fibulaire distale' },
        { name: 'Articulation Talo-Crurale', id: 'Talo-Crurale' },
        { name: 'Articulation Talo-Calcanéo-Naviculaire', id: 'Talo-Calcanéo-Naviculaire' },
        { name: 'Articulation Talo-Calcanéo-Cuboide', id: 'Talo-Calcanéo-Cuboide' },
        { name: 'Articulation Cunéo-Naviculaire', id: 'Cunéo-Naviculaire' },
        { name: 'Articulation Tarso-Métatarsienne', id: 'Tarso-Métatarsienne' },
    ],
};

function sendMainMenu(chatId, messageId = null) {
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Osteologie', callback_data: 'Osteologie' }],
                [{ text: 'Arthrologie', callback_data: 'Arthrologie' }]
            ]
        }
    };
    if (messageId) {
        bot.editMessageText('Choisissez le type d\'informations que vous souhaitez :', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: options.reply_markup
        });
    } else {
        bot.sendMessage(chatId, 'Choisissez le type d\'informations que vous souhaitez :', options);
    }
}

async function handleBoneOrJointRequest(chatId, messageId, section, item) {
    const prompt = section === 'Osteologie'
        ? `Donner une Definition, une Description, une Orientation, une Situation, et des Repères palpables de : ${item.name}.`
        : `Donner Type d'articulation, Surfaces articulaires, Moyens d'union, Muscles moteurs, Mouvement de l'articulation : ${item.name}.`;

    try {
        const result = await model.generateContent(prompt);
        const description = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        bot.editMessageText(description ? `${item.name}: ${description}` : 'عذرًا، لم أتمكن من جلب الوصف المطلوب.', {
            chat_id: chatId,
            message_id: messageId,
        });
    } catch (error) {
        console.error(error);
        bot.editMessageText('عذرًا، حدث خطأ أثناء جلب المعلومات. حاول مرة أخرى لاحقًا.', {
            chat_id: chatId,
            message_id: messageId,
        });
    }
}

bot.onText(/\/start/, (msg) => sendMainMenu(msg.chat.id));

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const [section, itemId] = query.data.split('_');

    if (query.data === 'Osteologie' || query.data === 'Arthrologie') {
        bot.editMessageText(`Choisir ${section === 'Osteologie' ? 'Os' : 'Articulation'} pour en savoir plus :`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    ...Anatomie[query.data].map(item => [{ text: item.name, callback_data: `${query.data}_${item.id}` }]),
                    [{ text: 'Retour ⬅️', callback_data: 'back_to_main' }]
                ]
            }
        });
    } else if (query.data === 'back_to_main') {
        sendMainMenu(chatId, messageId);
    } else if (Anatomie[section]) {
        const item = Anatomie[section].find(item => item.id === itemId);
        if (item) handleBoneOrJointRequest(chatId, messageId, section, item);
    }
});

console.log("Bot is running...");