const {
    default: makeWASocket,
    useMultiFileAuthState
} = require("@whiskeysockets/baileys");

const P = require("pino");
const axios = require("axios");

// 🔑 PUT YOUR OPENAI KEY
const OPENAI_KEY = "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";

// 📱 PUT YOUR NUMBER (NO +)
const PHONE_NUMBER = "237654319658";

const xp = new Map();
const spamDB = new Map();

async function startBot() {

    console.log("🚀 BOT STARTING...");

    const { state, saveCreds } = await useMultiFileAuthState("auth");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: P({ level: "info" }),
        browser: ["Railway Bot", "Chrome", "1.0.0"]
    });

    // 💾 SAVE SESSION
    sock.ev.on("creds.update", saveCreds);

    // 🔥 PAIRING CODE SYSTEM
    if (!sock.authState.creds.registered) {
        console.log("📲 REQUESTING PAIRING CODE...");

        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(PHONE_NUMBER);
                console.log("✅ PAIRING CODE:", code);
            } catch (err) {
                console.log("❌ ERROR GETTING CODE:", err);
            }
        }, 5000);
    }

    // 🔗 CONNECTION STATUS
    sock.ev.on("connection.update", ({ connection }) => {
        if (connection === "open") {
            console.log("✅ BOT CONNECTED SUCCESSFULLY");
        }
        if (connection === "close") {
            console.log("❌ CONNECTION CLOSED");
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
    });

    //
