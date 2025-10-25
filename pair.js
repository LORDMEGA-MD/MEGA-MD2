// pair.js
import express from "express";
import fs from "fs";
import pino from "pino";
import qrcode from "qrcode";
import cors from "cors";
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";

const app = express();
app.use(cors());
app.use(express.static("public"));

const sessions = new Map();

app.get("/qr", async (req, res) => {
  const userId = req.query.user || Date.now().toString();

  try {
    const folder = `./sessions/${userId}`;
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(folder);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: ["MEGA-MD", "Chrome", "10.0"],
    });

    let qrSent = false;

    sock.ev.on("connection.update", async (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr && !qrSent) {
        qrSent = true;
        const qrUrl = await qrcode.toDataURL(qr);
        res.json({ qr: qrUrl, user: userId });
      }

      if (connection === "open") {
        console.log(`✅ ${userId} connected`);
        await saveCreds();

        // send creds file back to user via WhatsApp
        const credsPath = `${folder}/creds.json`;
        if (fs.existsSync(credsPath)) {
          const credsData = fs.readFileSync(credsPath);
          const file = { document: credsData, mimetype: "application/json", fileName: "creds.json" };
          await sock.sendMessage(sock.user.id, file);

          await sock.sendMessage(sock.user.id, {
            text: `✅ *Session obtained successfully!*\n\nUpload this creds.json in your session folder.\n\n> 📢 _Do not share this file!_`,
          });
        }

        // cleanup
        setTimeout(() => {
          if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true });
          sock.ws.close();
        }, 10000);
      }

      if (connection === "close" && lastDisconnect) {
        console.log(`⚠️ ${userId} disconnected`);
      }
    });
  } catch (e) {
    console.error("❌ Error:", e);
    if (!res.headersSent) res.status(500).json({ error: "QR not received, try again" });
  }
});

app.listen(3000, () => console.log("🚀 MEGA-MD Pair Server running on port 3000"));
