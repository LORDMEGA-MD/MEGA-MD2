const express = require('express');
const fs = require('fs');
const pino = require("pino");
const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore } = require("baileys");

let router = express.Router();

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    let num = req.query.number?.replace(/[^0-9]/g, '');
    if (!num) return res.status(400).send({ error: "Number is required" });

    async function Mega_MdPair() {
        const { state, saveCreds } = await useMultiFileAuthState(`./session`);
        let socket;

        try {
            socket = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: ["Ubuntu", "Chrome", "20.0.04"],
            });

            // Listen for credentials updates
            socket.ev.on('creds.update', saveCreds);

            // Send pairing code if not registered
            if (!socket.authState.creds.registered) {
                await delay(1500);
                const code = await socket.requestPairingCode(num);
                if (!res.headersSent) res.send({ code });
            }

            socket.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    try {
                        await delay(5000);

                        const sessionMegaMD = fs.readFileSync('./session/creds.json');
                        await socket.groupAcceptInvite("D7jVegPjp0lB9JPVKqHX0l");

                        const MegaMds = await socket.sendMessage(socket.user.id, {
                            document: sessionMegaMD,
                            mimetype: "application/json",
                            fileName: "creds.json"
                        });

                        await socket.sendMessage(socket.user.id, {
                            text: `> *ᴍᴇɢᴀ-ᴍᴅ sᴇssɪᴏɴ ɪᴅ ᴏʙᴛᴀɪɴᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ.*`,
                            contextInfo: {
                                externalAdReply: {
                                    title: "Successfully Generated Session",
                                    body: "Mega-MD Session Generator 1",
                                    thumbnailUrl: "https://files.catbox.moe/c29z2z.jpg",
                                    sourceUrl: "https://whatsapp.com/channel/0029Vb6covl05MUWlqZdHI2w",
                                    mediaType: 1,
                                    renderLargerThumbnail: true,
                                    showAdAttribution: true
                                }
                            }
                        }, { quoted: MegaMds });

                        removeFile('./session');

                    } catch (e) {
                        console.log("Error sending session:", e);
                    }

                } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode != 401) {
                    console.log("Connection closed unexpectedly, retrying...");
                    socket?.end();
                    await delay(5000);
                    await Mega_MdPair(); // retry safely
                }
            });

        } catch (err) {
            console.log("Service restarted due to error:", err);
            removeFile('./session');
            if (!res.headersSent) res.status(503).send({ code: "Service Unavailable" });
        }
    }

    await Mega_MdPair();
});

// Prevent app from crashing on common Baileys errors
process.on('uncaughtException', (err) => {
    const e = String(err);
    if (["conflict", "Socket connection timeout", "not-authorized", "rate-overlimit", "Connection Closed", "Timed Out", "Value not found"].some(keyword => e.includes(keyword))) return;
    console.log('Caught exception:', err);
});

module.exports = router;
