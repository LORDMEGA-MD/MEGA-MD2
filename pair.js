// index.js
import express from "express";
import fs from "fs";
import pino from "pino";
import qrcode from "qrcode";
import cors from "cors";
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore } from "@whiskeysockets/baileys";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(".")); // serve pair.html directly from root

function removeFile(FilePath) {
  if (fs.existsSync(FilePath)) fs.rmSync(FilePath, { recursive: true, force: true });
}

app.get("/pair", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).send({ error: "Missing ?number parameter" });

  async function Mega_MdPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    try {
      let MegaMdEmpire = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
      });

      if (!MegaMdEmpire.authState.creds.registered) {
        await delay(1000);
        num = num.replace(/[^0-9]/g, "");
        const pairingCode = await MegaMdEmpire.requestPairingCode(num);

        if (!res.headersSent) {
          return res.send({ code: pairingCode });
        }
      }

      MegaMdEmpire.ev.on("creds.update", saveCreds);
      MegaMdEmpire.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;
        if (connection === "open") {
          console.log(`✅ Connected: ${MegaMdEmpire.user.id}`);

          await delay(10000);
          const sessionMegaMD = fs.readFileSync("./session/creds.json");

          await MegaMdEmpire.sendMessage(MegaMdEmpire.user.id, {
            document: sessionMegaMD,
            mimetype: "application/json",
            fileName: "creds.json",
          });

          await MegaMdEmpire.sendMessage(MegaMdEmpire.user.id, {
            text: `> *ᴍᴇɢᴀ-ᴍᴅ sᴇssɪᴏɴ ɪᴅ ᴏʙᴛᴀɪɴᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ.*     
📁ᴜᴘʟᴏᴀᴅ ᴛʜᴇ ᴄʀᴇᴅs.ᴊsᴏɴ ғɪʟᴇ ᴘʀᴏᴠɪᴅᴇᴅ ɪɴ ʏᴏᴜʀ sᴇssɪᴏɴ ғᴏʟᴅᴇʀ. 

_*🪀sᴛᴀʏ ᴛᴜɴᴇᴅ ғᴏʟʟᴏᴡ ᴡʜᴀᴛsᴀᴘᴘ ᴄʜᴀɴɴᴇʟ:*_ 
> _https://whatsapp.com/channel/0029Vb6covl05MUWlqZdHI2w_

_*ʀᴇᴀᴄʜ ᴍᴇ ᴏɴ ᴍʏ ᴛᴇʟᴇɢʀᴀᴍ:*_  
> _t.me/LordMega0_

> 🫩ʟᴀsᴛʟʏ, ᴅᴏ ɴᴏᴛ sʜᴀʀᴇ ʏᴏᴜʀ sᴇssɪᴏɴ ɪᴅ ᴏʀ ᴄʀᴇᴅs.ᴊsᴏɴ ғɪʟᴇ ᴡɪᴛʜ ᴀɴʏᴏɴᴇ.`,
          });

          await delay(100);
          removeFile("./session");
          return;
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode != 401
        ) {
          await delay(5000);
          Mega_MdPair();
        }
      });
    } catch (err) {
      console.log("❌ Service restarted due to:", err.message);
      removeFile("./session");
      if (!res.headersSent) {
        res.send({ code: "Service Unavailable" });
      }
    }
  }

  return await Mega_MdPair();
});

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/pair.html");
});

process.on("uncaughtException", function (err) {
  const e = String(err);
  if (
    e.includes("conflict") ||
    e.includes("Socket connection timeout") ||
    e.includes("not-authorized") ||
    e.includes("rate-overlimit") ||
    e.includes("Connection Closed") ||
    e.includes("Timed Out") ||
    e.includes("Value not found")
  )
    return;
  console.log("Caught exception:", err);
});

app.listen(PORT, () =>
  console.log(`🚀 MEGA-MD Pair Server running on port ${PORT}`)
);
