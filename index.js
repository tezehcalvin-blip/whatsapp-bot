const {
    default: makeWASocket,
    useMultiFileAuthState
} = require("@whiskeysockets/baileys");

const P = require("pino");
const config = require("./config");

// storage systems (we will use later)
const userAI = new Map();
const spamDB = new Map();

async function startBot() {

    const { state, saveCreds } = await useMultiFileAuthState("auth");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: "silent" })
    });

    sock.ev.on("creds.update", saveCreds);
