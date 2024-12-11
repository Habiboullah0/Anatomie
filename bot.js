const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const express = require("express");
const path = require("path");
require("dotenv").config();

// إعدادات التطبيق والخادم
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname)));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

// إعدادات البوت و Google Generative API
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;

// تحميل بيانات المستخدمين
let users = new Set();
try {
    const usersData = JSON.parse(fs.readFileSync("users.json", "utf-8"));
    usersData.Users.forEach((user) => users.add(JSON.stringify(user)));
} catch (error) {
    console.error("Error loading users.json:", error);
}

// تحميل بيانات التشريح
let Anatomie = {};
try {
    Anatomie = JSON.parse(fs.readFileSync("./anatomie.json", "utf8")).Anatomie;
    console.log("Loaded Anatomie data successfully.");
} catch (error) {
    console.error("Error loading anatomie.json:", error);
}

// إرسال رسالة لجميع المستخدمين
function sendBroadcastMessage(message) {
    users.forEach((userString) => {
        const user = JSON.parse(userString);
        bot.sendMessage(user.chatId, message).catch((err) => console.error(`Failed to send message to ${user.fullName}`, err));
    });
}

// إرسال القائمة الرئيسية
function sendMainMenu(chatId, messageId = null, backToSection = null) {
    const options = {
        reply_markup: {
            inline_keyboard: [
                ...Object.keys(Anatomie).map((section) => [{ text: section, callback_data: section }]),
                backToSection ? [{ text: "Retour ⬅️", callback_data: backToSection }] : []
            ]
        }
    };
    const text = "Choisissez le type souhaité :";
    if (messageId) {
        bot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup: options.reply_markup });
    } else {
        bot.sendMessage(chatId, text, options);
    }
}

// إرسال تفاصيل مستخدم جديد لمالك البوت
function sendUserDetailsToOwner(user) {
    bot.sendMessage(
        OWNER_CHAT_ID,
        `مستخدم جديد تفاعل مع البوت:
الاسم الكامل: ${user.fullName}
اسم المستخدم: ${user.username}
معرف المستخدم: ${user.userId}
معرف المحادثة: ${user.chatId}
اللغة: ${user.language}`
    );
}

// معالجة طلبات العناصر
async function handleItemRequest(chatId, messageId, section, item, fullName) {
    try {
        // حذف الرسالة الأصلية بعد إرسال الإشعار
        await bot.deleteMessage(chatId, messageId);

        // إرسال إشعار للمستخدم أن الطلب قيد المعالجة
        const notificationMsg = await bot.sendMessage(chatId, "Votre commande est en cours de préparation, veuillez patienter...");

        const prompts = {
            Osteologie: `Donner une Definition, une Description, une Orientation, une Situation, et des Repères palpables de : ${item.name}.`,
            Arthrologie: `Donner Type d'articulation, Surfaces articulaires, Moyens d'union, Muscles moteurs, Mouvement de l'articulation : ${item.name}.`,
            Myologie: `Décrire l'origine, trajet, terminaison, action et l'innervation du muscle : ${item.name}.`,
            Vascularisation: `Donner la vascularisation, l'origine et les branches principales de : ${item.name}.`,
            Lymphatiques: `Décrire la distribution et les structures cibles du système lymphatique de : ${item.name}.`,
            Innervation: `Donner les nerfs principaux, les branches et les cibles d'innervation de : ${item.name}.`,
        };

        const prompt = prompts[section];

        // إرسال الاستعلام إلى API
        const result = await model.generateContent(prompt);

        // استخراج الجواب باستخدام المسار المطلوب
        const description = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (description) {
            await bot.deleteMessage(chatId, notificationMsg.message_id);
            await bot.sendMessage(chatId, description);
            console.log(`Sending message to ${fullName}`);
        } else {
            await bot.sendMessage(chatId, `Désolé, je n'ai pas pu récupérer les informations demandées pour ${item.name}.`);
        }
    } catch (error) {
        console.error("Une erreur s/'est produite lors du traitement de la demande :", error); // طباعة تفاصيل الخطأ
        await bot.sendMessage(chatId, "Désolé, une erreur s/'est produite lors de la récupération des informations. Réessayez plus tard.");
    }
}

// استجابة لرسالة /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const fullName = `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();
    const user = {
        fullName,
        username: msg.from.username || "غير متوفر",
        userId,
        chatId,
        language: msg.from.language_code || "غير متوفر",
    };

    if (![...users].some((userString) => JSON.parse(userString).userId === userId)) {
        users.add(JSON.stringify(user));
        sendUserDetailsToOwner(user);
    }

    sendMainMenu(chatId);
});

// دالة للبحث عن العنصر في القسم
function findItemInSection(sectionData, itemId) {
    if (typeof sectionData === 'object' && !Array.isArray(sectionData)) {
        for (const subSection in sectionData) {
            const foundItem = findItemInSection(sectionData[subSection], itemId);
            if (foundItem) return foundItem;
        }
    } else if (Array.isArray(sectionData)) {
        return sectionData.find(item => item.id === itemId);
    }
    return null;
}

// التعامل مع استجابة callback
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const [section, subSection, itemId] = query.data.split('_');

    const user = [...users].find(userString => JSON.parse(userString).chatId === chatId);
    const fullName = user ? JSON.parse(user).fullName : 'غير معروف';

    try {
        if (query.data === 'main_menu') {
            // العودة إلى القائمة الرئيسية
            sendMainMenu(chatId, messageId);
        } else if (itemId) {
            // إذا تم اختيار عنصر معين
            const item = findItemInSection(Anatomie[section], itemId);
            if (item) {
                handleItemRequest(chatId, messageId, section, item, fullName);
            } else {
                bot.sendMessage(chatId, "L/'élément demandé n/'a pas été trouvé.");
            }
        } else if (subSection) {
            // عرض العناصر في القسم الفرعي وإضافة زر "رجوع" للقسم الرئيسي
            const items = Anatomie[section][subSection];
            if (Array.isArray(items)) {
                bot.editMessageText(`Sélectionnez un élément parmi ${subSection}:`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            ...items.map(item => [{ text: item.name, callback_data: `${section}_${subSection}_${item.id}` }]),
                            [{ text: "Retour ⬅️", callback_data: section }]
                        ]
                    }
                });
            } else {
                bot.sendMessage(chatId, "Désolé, aucun élément n/'est disponible dans cette sous-section.");
            }
        } else if (Anatomie[section]) {
            // عرض الأقسام الفرعية وإضافة زر "رجوع" إلى القائمة الرئيسية
            const subSections = Object.keys(Anatomie[section]);
            bot.editMessageText(`Sélectionnez une sous-section de ${section}:`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        ...subSections.map(subSection => [{ text: subSection, callback_data: `${section}_${subSection}` }]),
                        [{ text: "Retour ⬅️", callback_data: 'main_menu' }]
                    ]
                }
            });
        } else {
            bot.sendMessage(chatId, "Désolé, la section n/'est pas disponible.");
        }
    } catch (error) {
        console.error("Error handling callback query:", error);
        bot.sendMessage(chatId, "Une erreur s/'est produite lors du traitement de votre demande. Veuillez essayer plus tard.");
    }
});

bot.on("message", (msg) => {
    if (msg.chat.id.toString() === OWNER_CHAT_ID && msg.text.startsWith("Nouvelle mise à jour")) {
        sendBroadcastMessage(msg.text);
    }
});

console.log("Bot is running...");
