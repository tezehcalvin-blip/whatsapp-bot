const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");
const axios = require("axios");

// 🔑 KEYS
const OPENAI_KEY = "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";
const GEMINI_KEY = "AQ.Ab8RN6KT1LJHk_HR4LefRkB4jxXHKF59n4QsTqpW5Vie-AZvRw";
const GROK_KEY = "YOUR_GROK_KEY";

// 👑 OWNER
const OWNER_NUMBER = "2376XXXXXXXX";

// ⚙️ BOT SETTINGS
let aiProvider = "gpt";
let botMode = "public";

const xp = new Map();
const spamDB = new Map();

async function startBot() {

    console.log("🚀 BOT STARTING...");

    const { state, saveCreds } = await useMultiFileAuthState("auth");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: "info" }),
        browser: ["Atlas Bot", "Chrome", "1.0.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    // 📲 CONNECTION + RECONNECT
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
            console.log("✅ BOT CONNECTED");
        }

        if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;

            console.log("❌ CLOSED:", code);

            if (code !== DisconnectReason.loggedOut) {
                console.log("🔁 RECONNECTING...");
                startBot();
            }
        }
    });

    // 👋 GROUP WELCOME
    sock.ev.on("group-participants.update", async (update) => {
        const { id, participants, action } = update;

        if (action === "add") {
            await sock.sendMessage(id, {
                text: `👋 Welcome @${participants[0].split("@")[0]}!`,
                mentions: participants
            });
        }

        if (action === "remove") {
            await sock.sendMessage(id, {
                text: `👋 Goodbye @${participants[0].split("@")[0]}`
            });
        }
    });

    // 👀 AUTO STATUS VIEW
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        if (msg.key.remoteJid === "status@broadcast") {
            try {
                await sock.readMessages([msg.key]);
            } catch {}
        }
    });

    // 🧠 MAIN ENGINE
    sock.ev.on("messages.upsert", async ({ messages }) => {

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text;

        if (!text) return;

        const msgText = text.toLowerCase();
        const isGroup = sender.endsWith("@g.us");

        // 🔐 PRIVATE MODE
        if (botMode === "private" && sender !== OWNER_NUMBER + "@s.whatsapp.net") {
            return;
        }

        // ⚡ AUTO REACT
        await sock.sendMessage(sender, {
            react: { text: "👍", key: msg.key }
        });

        // 💬 AUTO REPLY
        const autoReplies = {
            hi: "Hello 👋",
            hello: "Hi 👋",
            help: "Use ask <question> 🤖"
        };

        if (autoReplies[msgText]) {
            await sock.sendMessage(sender, { text: autoReplies[msgText] });
        }

        // 🛡️ ANTI-SPAM
        const now = Date.now();
        if (!spamDB.has(sender)) spamDB.set(sender, []);

        let times = spamDB.get(sender);
        times.push(now);
        times = times.filter(t => now - t < 5000);

        if (times.length > 6) {
            await sock.sendMessage(sender, { text: "🚫 Stop spamming!" });
            return;
        }

        spamDB.set(sender, times);

        // 🚫 ANTI-LINK
        const isLink = /(https?:\/\/|www\.|wa\.me|chat\.whatsapp\.com)/gi;

        if (isLink.test(text)) {
            await sock.sendMessage(sender, { text: "⚠️ Links not allowed!" });

            try {
                await sock.sendMessage(sender, { delete: msg.key });
            } catch {}

            try {
                if (isGroup) {
                    await sock.groupParticipantsUpdate(
                        sender,
                        [msg.key.participant],
                        "remove"
                    );
                }
            } catch {}

            return;
        }

        // 📊 XP
        xp.set(sender, (xp.get(sender) || 0) + 5);

        // 🤖 AI GROUP AUTO REPLY
        if (isGroup) {

            const botMentioned =
                msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.includes(sock.user.id);

            const triggers = ["who", "what", "how", "why", "help"];

            const shouldReply = botMentioned || msgText.includes("bot") || triggers.some(t => msgText.includes(t));

            if (shouldReply) {
                const reply = await askAI(text);
                await sock.sendMessage(sender, { text: "🤖 " + reply });
            }
        }

        // 💬 COMMANDS
        if (msgText === "ping") {
            await sock.sendMessage(sender, { text: "PONG ⚡" });
        }

        if (msgText === "xp") {
            await sock.sendMessage(sender, {
                text: `📊 XP: ${xp.get(sender) || 0}`
            });
        }

        // 👑 OWNER COMMANDS
        if (msgText.startsWith("owner ")) {

            if (sender !== OWNER_NUMBER + "@s.whatsapp.net") {
                return sock.sendMessage(sender, { text: "❌ Owner only" });
            }

            const cmd = msgText.replace("owner ", "");

            if (cmd === "ping") {
                await sock.sendMessage(sender, { text: "👑 Owner active" });
            }

            if (cmd === "stats") {
                await sock.sendMessage(sender, {
                    text: `Users: ${xp.size}`
                });
            }

            if (cmd === "restart") {
                process.exit(1);
            }
        }

        // 🤖 MANUAL AI
        if (msgText.startsWith("ask ")) {

            const question = text.slice(4);

            const reply = await askAI(question);

            await sock.sendMessage(sender, { text: reply });
        }
    });
}

// 🤖 AI SWITCH SYSTEM
async function askAI(prompt) {

    try {
        if (aiProvider === "gpt") {
            return await askGPT(prompt);
        }

        if (aiProvider === "gemini") {
            return await askGemini(prompt);
        }

        if (aiProvider === "grok") {
            return await askGrok(prompt);
        }

    } catch {
        return "❌ AI error";
    }
}

// GPT
async function askGPT(prompt) {
    const res = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }]
        },
        {
            headers: {
                Authorization: `Bearer ${OPENAI_KEY}`
            }
        }
    );

    return res.data.choices[0].message.content;
}

// GEMINI
async function askGemini(prompt) {
    const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
        {
            contents: [{ parts: [{ text: prompt }] }]
        }
    );

    return res.data.candidates[0].content.parts[0].text;
}

// GROK (placeholder API)
async function askGrok(prompt) {
    const res = await axios.post(
        "https://api.x.ai/v1/chat/completions",
        {
            model: "grok-beta",
            messages: [{ role: "user", content: prompt }]
        },
        {
            headers: {
                Authorization: `Bearer ${GROK_KEY}`
            }
        }
    );

    return res.data.choices[0].message.content;
}

startBot();
