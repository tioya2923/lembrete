const express = require('express');
const cors = require('cors');
const wppconnect = require('@wppconnect-team/wppconnect');

const app = express();

app.use(cors({
  origin: ['https://snref-fronten-8dbe187fda6c.herokuapp.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

let clientInstance = null;
let isReady = false;
let isInitializing = false;

async function iniciarWPP() {
  if (isInitializing) return;
  isInitializing = true;

  try {
    const client = await wppconnect.create({
      session: 'whatsapp-bot',
      catchQR: (base64Qr, asciiQR) => {
        console.log('\n--- NOVO QR CODE GERADO ---\n' + asciiQR + '\n---------------------------\n');
      },
      statusFind: (statusSession) => console.log('Status da Sessão:', statusSession),
      headfull: false,
      autoClose: false,
      tokenStore: 'file',
      folderNameToken: 'tokens',
      puppeteerOptions: {
        executablePath: '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
      }
    });

    clientInstance = client;
    isReady = true;
    isInitializing = false;
    console.log('✅ WPPConnect pronto!');

    client.onStateChange((state) => {
      if (state === 'DISCONNECTED' || state === 'UNPAIRED') {
        isReady = false;
        clientInstance = null;
        setTimeout(iniciarWPP, 15000);
      }
    });
  } catch (error) {
    isInitializing = false;
    setTimeout(iniciarWPP, 20000);
  }
}

iniciarWPP();

app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;

  if (!isReady || !clientInstance) return res.status(503).json({ error: 'Servidor não pronto' });

  try {
    let cleanNumber = String(number).replace(/\D/g, '');
    let jid = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@c.us`;

    console.log(`📨 Validando e enviando para: ${jid}`);

    // Passo 1: Validar o número e obter o ID real (seja @c.us ou @lid)
    const profile = await clientInstance.checkNumberStatus(jid);
    const targetId = profile.id._serialized; 

    console.log(`🎯 ID Real Detectado: ${targetId}`);

    // Passo 2: Enviar para o ID real retornado pelo WhatsApp
    const result = await clientInstance.sendText(targetId, String(message));

    return res.json({ success: true, messageId: result.id });

  } catch (e) {
    console.error('❌ Erro no envio:', e.message);

    // Fallback de emergência caso o checkNumberStatus falhe mas tenhamos o ID do erro
    if (e.id && e.id.id) {
       try {
           console.log(`🔄 Fallback final para: ${e.id.id}`);
           const retry = await clientInstance.sendText(e.id.id, String(message));
           return res.json({ success: true, messageId: retry.id });
       } catch (innerE) {
           return res.status(500).json({ error: 'Falha total', detail: innerE.message });
       }
    }

    return res.status(500).json({ error: 'Erro ao enviar', detail: e.message });
  }
});

app.listen(3000, () => console.log(`🚀 API em http://localhost:3000`));