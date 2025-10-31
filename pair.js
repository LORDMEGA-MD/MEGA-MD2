import express from "express";
import http from "http";
import { Server as IOServer } from "socket.io";
import fs from "fs";
import path from "path";
import Pino from "pino";
import archiver from "archiver";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";

const app = express();
const server = http.createServer(app);
const io = new IOServer(server);
const logger = Pino({ level: "info" });

app.use(express.static("public"));

let latestQr = null;
let connectionStatus = "init";

// Emit to clients
io.on("connection", (socket) => {
  logger.info("🖥️ Client connected to socket.io");
  socket.emit("qr", latestQr);
  socket.emit("status", connectionStatus);
});

// Recursive buffer → base64 converter
function encodeBuffers(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Buffer.isBuffer(obj)) return { type: "Buffer", data: obj.toString("base64") };
  if (obj.type === "Buffer" && obj.data !== undefined) {
    if (Array.isArray(obj.data)) return { type: "Buffer", data: Buffer.from(obj.data).toString("base64") };
    if (typeof obj.data === "string") return { type: "Buffer", data: obj.data };
  }
  const result = Array.isArray(obj) ? [] : {};
  for (const key in obj) result[key] = encodeBuffers(obj[key]);
  return result;
}

// Validate that creds.json has required keys
function validateCreds(creds) {
  const required = [
    "noiseKey",
    "pairingEphemeralKeyPair",
    "signedIdentityKey",
    "signedPreKey",
    "advSecretKey",
    "me",
    "signalIdentities",
    "platform",
    "myAppStateKeyId",
  ];
  const missing = required.filter((k) => !(k in creds));
  return {
    valid: missing.length === 0,
    missing,
  };
}

// Delete only files in a folder
function emptyFolder(folderPath) {
  if (!fs.existsSync(folderPath)) return;
  const files = fs.readdirSync(folderPath);
  for (const file of files) {
    const fullPath = path.join(folderPath, file);
    if (fs.lstatSync(fullPath).isFile()) fs.unlinkSync(fullPath);
  }
}

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./src/session");
  const { version } = await fetchLatestBaileysVersion();

  const waSocket = makeWASocket({
    auth: state,
    version,
    logger,
    printQRInTerminal: false,
    browser: ["Mega-MD", "Chrome", "1.0.0"],
  });

  waSocket.ev.on("creds.update", saveCreds);

  waSocket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      connectionStatus = "qr";
      io.emit("qr", qr);
      io.emit("status", connectionStatus);
      logger.info("📸 QR emitted to frontend");
    }

    if (connection) {
      connectionStatus = connection;
      io.emit("status", connectionStatus);
      logger.info("🔌 Connection status:", connection);
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      logger.warn("⚠️ Connection closed:", reason);
      if (reason === DisconnectReason.loggedOut) {
        logger.warn("🪶 Logged out — clearing session.");
      }
      setTimeout(() => startWhatsApp().catch((err) => logger.error(err)), 2500);
    }

    if (connection === "open") {
      latestQr = null;
      io.emit("qr", null);
      connectionStatus = "open";
      io.emit("status", connectionStatus);
      logger.info("✅ Connected to WhatsApp successfully");

      try {
        await new Promise((resolve) => setTimeout(resolve, 2500));

        if (!state?.creds) return logger.warn("❌ state.creds not found — skipping save");

        state.creds.registered = true;

        const finalCreds = encodeBuffers(state.creds);
        const { valid, missing } = validateCreds(finalCreds);
        if (!valid) logger.warn(`⚠️ Missing fields in creds.json: ${missing.join(", ")}`);

        // Write creds.json
        const credsPath = path.resolve("./src/session/creds.json");
        fs.mkdirSync(path.dirname(credsPath), { recursive: true });
        fs.writeFileSync(credsPath, JSON.stringify(finalCreds, null, 2), "utf8");
        logger.info("📦 Saved valid creds.json successfully.");

        // Zip all session files
        const zipPath = path.resolve("./src/session/Mega-MD-session.zip");
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        archive.pipe(output);
        archive.directory("./src/session/", false);
        await archive.finalize();
        logger.info("🗜️ Session folder zipped successfully.");

        output.on("close", async () => {
          const targetId = waSocket?.user?.id || state.creds?.me?.id;
          if (!targetId) return logger.warn("No valid target JID found — skipping send");

          const zipFile = fs.readFileSync(zipPath);
          const sentDoc = await waSocket.sendMessage(targetId, {
            document: zipFile,
            mimetype: "application/zip",
            fileName: "Mega-MD-session.zip",
          });

          // Send follow-up message with thumbnail, Telegram, WhatsApp
          const infoText = `> *ᴍᴇɢᴀ-ᴍᴅ ɪᴅ ᴏʙᴛᴀɪɴᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ.*
📁ᴜᴘʟᴏᴀᴅ ᴛʜᴇ ᴢɪᴘ ғɪʟᴇ ᴘʀᴏᴠɪᴅᴇᴅ ɪɴ ʏᴏᴜʀ ғᴏʟᴅᴇʀ.

_*Telegram:*_ t.me/LordMega0
_*WhatsApp:*_ https://wa.me/256783991705
> 🫩ʟᴀsᴛʟʏ, ᴅᴏ ɴᴏᴛ sʜᴀʀᴇ ʏᴏᴜʀ sᴇssɪᴏɴ ᴢɪᴘ ᴡɪᴛʜ ᴀɴʏᴏɴᴇ.`;

          await waSocket.sendMessage(
            targetId,
            {
              text: infoText,
              contextInfo: {
                externalAdReply: {
                  title: "Successfully Generated Session",
                  body: "Mega-MD Session Generator 1",
                  thumbnailUrl: "https://files.catbox.moe/c29z2z.jpg",
                  sourceUrl: "https://wa.me/256783991705",
                  mediaType: 1,
                  renderLargerThumbnail: true,
                  showAdAttribution: true,
                },
              },
            },
            { quoted: sentDoc }
          );

          // Empty session folder after sending zip
          emptyFolder("./src/session");
          logger.info("🗑️ Session folder emptied for new scans.");
        });
      } catch (err) {
        logger.error("❌ Error during creds/zip send:", err);
      }
    }
  });

  waSocket.ev.on("messages.upsert", async (m) => {
    const messages = m.messages || [];
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      logger.info(`📩 Message from ${jid}: ${text}`);
      if (text === "!ping") {
        await waSocket.sendMessage(jid, { text: "Pong from Mega-MD Web!" });
      }
    }
  });
}

startWhatsApp().catch((err) => logger.error(err));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => logger.info(`🌐 Server running at http://localhost:${PORT}`));
