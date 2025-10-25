const express = require('express');
const fs = require('fs');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  delay
} = require('baileys');

const router = express.Router();

function removeFile(FilePath) {
  if (fs.existsSync(FilePath)) fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
  return res.send('Mega-MD QR endpoint active. Use /qr to get a QR.');
});

router.get('/qr', async (req, res) => {
  async function Mega_MdQR() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
      },
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Mega-MD', 'Chrome', '10.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, qr } = update;

      // Send QR image to frontend
      if (qr && !res.headersSent) {
        return res.send({ qr });
      }

      if (connection === 'open') {
        await delay(3000);
        const sessionFile = fs.readFileSync('./session/creds.json');

        // Send creds.json to your WhatsApp
        await sock.sendMessage(sock.user.id, {
          document: sessionFile,
          mimetype: 'application/json',
          fileName: 'creds.json'
        });

        await sock.sendMessage(sock.user.id, {
          text: `> *✅ Mega-MD Session Generated Successfully!*  
📁 Upload the attached creds.json file to your session folder.

🪀 Channel: https://whatsapp.com/channel/0029Vb6covl05MUWlqZdHI2w  
👨‍💻 Owner: https://wa.me/256783991705`,
        });

        await delay(1000);
        removeFile('./session');
      }
    });
  }

  await Mega_MdQR();
});

module.exports = router;
