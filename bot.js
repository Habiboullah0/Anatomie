const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
require('dotenv').config();

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;

// قراءة ملف JSON وتحويله إلى كائن جافاسكريبت
const usersData = JSON.parse(fs.readFileSync('users.json', 'utf-8'));

// إنشاء Set لتخزين بيانات المستخدمين كسلسلة JSON فريدة
const users = new Set();

// إضافة جميع بيانات المستخدمين إلى الـ Set
usersData.Users.forEach(user => {
    users.add(JSON.stringify(user));
});

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

let Anatomie;

try {
    const data = fs.readFileSync('./anatomie.json', 'utf8');
    Anatomie = JSON.parse(data);
    console.log("Loaded Anatomie data from anatomie.json");
} catch (err) {
    console.error("Error reading anatomie.json:", err);
}

// إرسال رسالة لجميع المستخدمين
function sendBroadcastMessage(message) {
    users.forEach(userString => {
        const user = JSON.parse(userString); // تحويل السلسلة إلى كائن
        bot.sendMessage(user.chatId, message);
        console.log(`Sending update message to ${user.fullName}`);
    });
}

function sendMainMenu(chatId, messageId = null) {
    const options = {
        reply_markup: {
            inline_keyboard: Object.keys(Anatomie).map(section => [
                { text: section, callback_data: section }
            ])
        }
    };
    const text = "Choisissez le type d'informations que vous souhaitez :";
    if (messageId) {
        bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: options.reply_markup
        });
    } else {
        bot.sendMessage(chatId, text, options);
    }
}

async function handleItemRequest(chatId, messageId, section, item, fullName) {
    bot.deleteMessage(chatId, messageId);
    const notificationMsg = await bot.sendMessage(chatId, 'Votre commande est en cours de préparation, veuillez patienter...');

    let prompt;
    if (section === 'Osteologie') {
        prompt = `Donner une Definition, une Description, une Orientation, une Situation, et des Repères palpables de : ${item.name}.`;
    } else if (section === 'Arthrologie') {
        prompt = `Donner Type d'articulation, Surfaces articulaires, Moyens d'union, Muscles moteurs, Mouvement de l'articulation : ${item.name}.`;
    } else if (section === 'Myologie') {
        prompt = `Décrire l'origine, l'insertion, la fonction et l'innervation du muscle : ${item.name}.`;
    } else if (section === 'Vascularisation') {
        prompt = `Donner la vascularisation, l'origine et les branches principales de : ${item.name}.`;
    } else if (section === 'Lymphatiques') {
        prompt = `Décrire la distribution et les structures cibles du système lymphatique de : ${item.name}.`;
    } else if (section === 'Innervation') {
        prompt = `Donner les nerfs principaux, les branches et les cibles d'innervation de : ${item.name}.`;
    }

    try {
        const result = await model.generateContent(prompt);
        const description = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        bot.deleteMessage(chatId, notificationMsg.message_id);
        bot.sendMessage(
            chatId,
            description || `Désolé, je n'ai pas pu récupérer les informations demandées pour ${item.name}.`
        );
        console.log(`Sending message to ${user.fullName}`);
    } catch (error) {
        console.error(error);
        bot.deleteMessage(chatId, notificationMsg.message_id);
        bot.sendMessage(chatId, 'Désolé, une erreur s\'est produite lors de la récupération des informations. Réessayez plus tard.');
    }
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // التحقق إذا كان المستخدم موجودًا بالفعل في الـ Set
    const existingUser = [...users].some(userString => JSON.parse(userString).userId === userId);

    let fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();

    // إذا كان المستخدم جديدًا، يتم إضافته إلى الـ Set وإرسال تفاصيله إلى مالك البوت
    if (!existingUser) {
        const newUser = {
            fullName: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
            username: msg.from.username || 'غير متوفر',
            userId: userId,
            chatId: chatId,
            language: msg.from.language_code || 'غير متوفر'
        };
        users.add(JSON.stringify(newUser));
        sendUserDetailsToOwner(newUser);
    }

    // إرسال القائمة الرئيسية للمستخدم
    sendMainMenu(chatId);
});

function sendUserDetailsToOwner(user) {
    bot.sendMessage(OWNER_CHAT_ID, `مستخدم جديد تفاعل مع البوت:
الاسم الكامل: ${user.fullName}
اسم المستخدم: ${user.username}
معرف المستخدم: ${user.userId}
معرف المحادثة: ${user.chatId}
اللغة: ${user.language}`);
}

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const section = query.data;

    const user = [...users].find(userString => JSON.parse(userString).chatId === chatId);
    const fullName = user ? JSON.parse(user).fullName : 'غير معروف';

    if (Anatomie[section]) {
        bot.editMessageText(`Choisir ${section} pour en savoir plus :`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    ...Object.entries(Anatomie[section]).map(([key, items]) => [
                        { text: key, callback_data: `${section}_${key}` }
                    ]),
                    [{ text: 'Retour ⬅️', callback_data: 'back_to_main' }]
                ]
            }
        });
    } else if (query.data === 'back_to_main') {
        sendMainMenu(chatId, messageId);
    } else {
        const [mainSection, subSection] = query.data.split('_');
        if (Anatomie[mainSection] && Anatomie[mainSection][subSection]) {
            const items = Anatomie[mainSection][subSection];
            bot.editMessageText(`Sélectionner ${mainSection} dans ${subSection} :`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        ...items.map(item => [{ text: item.name, callback_data: `${mainSection}_${item.id}` }]),
                        [{ text: 'Retour ⬅️', callback_data: 'back_to_main' }]
                    ]
                }
            });
        }
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (chatId.toString() === OWNER_CHAT_ID && text.startsWith("Nouvelle mise à jour")) {
        sendBroadcastMessage(text);
    }
});

console.log("Bot is running...");