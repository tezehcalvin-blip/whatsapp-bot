const {
    default: makeWASocket,
    useMultiFileAuthState
} = require("@whiskeysockets/baileys");

const P = require("pino");
const axios = require("axios");

const OPENAI_KEY = "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";

const xp = new Map();
const spamDB = new Map();

async function startBot() {

    const { state, saveCreds } = await useMultiFileAuthState("auth");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: "silent" })
    });

    sock.ev.on("creds.update", saveCreds);

    // 👋 GROUP WELCOME
    sock.ev.on("group-participants.update", async (update) => {
        const { id, participants, action } = update;

        if (action === "add") {
            await sock.sendMessage(id, {
                text: `👋 Welcome @${participants[0].split("@")[0]} to the group!`,
                mentions: participants
            });
        }
    });

    // 🧠 MESSAGE ENGINE
    sock.ev.on("messages.upsert", async ({ messages }) => {

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith("@g.us");

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text;

        if (!text) return;

        const msgText = text.toLowerCase();

        // 📊 XP SYSTEM
        xp.set(sender, (xp.get(sender) || 0) + 5);

        // 🛡️ ANTI-SPAM
        const now = Date.now();
        if (!spamDB.has(sender)) spamDB.set(sender, []);

        let times = spamDB.get(sender);
        times.push(now);
        times = times.filter(t => now - t < 5000);

        if (times.length > 6) {
            await sock.sendMessage(sender, {
                text: "🚫 Stop spamming!"
            });
            return;
        }

        spamDB.set(sender, times);

        // ⚡ AUTO REACT
        await sock.sendMessage(sender, {
            react: {
                text: "👍",
                key: msg.key
            }
        });

        // 💬 BASIC COMMANDS
        if (msgText === "hi") {
            await sock.sendMessage(sender, {
                text: "Hello 👋 I am your bot"
            });
        }

        if (msgText === "ping") {
            await sock.sendMessage(sender, {
                text: "PONG ⚡"
            });
        }

        // 🤖 GPT AI
        if (msgText.startsWith("ask ")) {

            const question = text.slice(4);

            await sock.sendMessage(sender, {
                text: "🤖 Thinking..."
            });

            const reply = await askGPT(question);

            await sock.sendMessage(sender, {
                text: reply
            });

            return;
        }

        // 📊 XP CHECK
        if (msgText === "xp") {
            await sock.sendMessage(sender, {
                text: `📊 Your XP: ${xp.get(sender) || 0}`
            });
        }

        // 📌 HELP
        if (msgText === "help") {
            await sock.sendMessage(sender, {
                text:
`🤖 BOT COMMANDS

hi - greet bot
ping - test bot
ask <question> - AI chat
xp - check XP`
            });
        }

    });

}

// 🤖 GPT FUNCTION
async function askGPT(prompt) {
    try {
        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }]
            },
            {
                headers: {
                    Authorization: `Bearer ${OPENAI_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        return res.data.choices[0].message.content;
    } catch (e) {
        return "❌ AI error, try again later";
    }
}

// START BOT
startBot();
