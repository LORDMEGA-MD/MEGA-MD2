const express = require('express');
const fs = require('fs');
const pino = require("pino");
const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore } = require("baileys");

const router = express.Router();

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).send({ error: "Number is required" });
    num = num.replace(/[^0-9]/g, '');

    async function Mega_MdPair() {
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        let sock;

        try {
            sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: ["Ubuntu", "Chrome", "20.0.04"]
            });

            sock.ev.on('creds.update', saveCreds);

            // If the number is not registered, trigger pairing flow
            if (!sock.authState.creds.registered) {
                await delay(1500);
                const pairingToken = await sock.requestPairingCode(num);
                if (!res.headersSent) {
                    res.send({ code: pairingToken });
                }
            }

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    await delay(5000);

                    // Read session file
                    const sessionMegaMD = fs.readFileSync('./session/creds.json');

                    // Send session file to paired number
                    const MegaMds = await sock.sendMessage(num + '@s.whatsapp.net', {
                        document: sessionMegaMD,
                        mimetype: 'application/json',
                        fileName: 'creds.json'
                    });

                    // Send your original Mega-MD text message
                    await sock.sendMessage(num + '@s.whatsapp.net', {
                        text: `> *ᴍᴇɢᴀ-ᴍᴅ sᴇssɪᴏɴ ɪᴅ ᴏʙᴛᴀɪɴᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ.*     
📁ᴜᴘʟᴏᴀᴅ ᴛʜᴇ ᴄʀᴇᴅs.ᴊsᴏɴ ғɪʟᴇ ᴘʀᴏᴠɪᴅᴇᴅ ɪɴ ʏᴏᴜʀ sᴇssɪᴏɴ ғᴏʟᴅᴇʀ. 

_*🪀sᴛᴀʏ ᴛᴜɴᴇᴅ ғᴏʟʟᴏᴡ ᴡʜᴀᴛsᴀᴘᴘ ᴄʜᴀɴɴᴇʟ:*_ 
> _https://whatsapp.com/channel/0029Vb6covl05MUWlqZdHI2w_

_*ʀᴇᴀᴄʜ ᴍᴇ ᴏɴ ᴍʏ  ᴛᴇʟᴇɢʀᴀᴍ:*_  
> _t.me/LordMega0_


> 🫩ʟᴀsᴛʟʏ ᴅᴏ ɴᴏᴛ sʜᴀʀᴇ ʏᴏᴜʀ sᴇssɪᴏɴ ɪᴅ ᴏʀ ᴄʀᴇᴅs.ᴊsᴏɴ ғɪʟᴇ ᴡɪᴛʜ ᴀɴʏᴏɴᴇ ʙʀᴏ ᴀɴᴅ ғᴏʀ ᴀɴʏ ʜᴇʟᴘ _*ᴅᴍ ᴏᴡɴᴇʀ https://wa.me/256783991705*_  `,
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
                    return;
                }

                // Retry if connection closed unexpectedly
                if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
                    console.log("Connection closed, retrying...");
                    removeFile('./session');
                    await delay(5000);
                    await Mega_MdPair();
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

module.exports = router;
