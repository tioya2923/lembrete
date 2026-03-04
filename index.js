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
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage', 
          '--single-process',
          '--no-zygote'
        ]
      }
    });

    clientInstance = client;
    isReady = true;
    isInitializing = false;
    console.log('✅ WPPConnect pronto!');

    client.onStateChange((state) => {
      console.log('Estado da conexão:', state);
      if (state === 'DISCONNECTED' || state === 'UNPAIRED') {
        isReady = false;
        clientInstance = null;
        setTimeout(iniciarWPP, 15000);
      }
    });
  } catch (error) {
    console.error('Erro na inicialização:', error);
    isInitializing = false;
    setTimeout(iniciarWPP, 20000);
  }
}

iniciarWPP();

app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;

  if (!isReady || !clientInstance) {
    return res.status(503).json({ error: 'Bot não pronto' });
  }

  try {
    const cleanNumber = String(number).replace(/\D/g, '');
    const target = `${cleanNumber}@c.us`;

    console.log(`🚀 Enviando mensagem para: ${target}`);

    const result = await clientInstance.sendText(target, String(message));

    console.log('✅ Mensagem enviada!');
    return res.json({ success: true, id: result.id });

  } catch (e) {
    console.error('❌ Erro ao enviar mensagem:', e.message);
    return res.status(500).json({ error: 'Erro ao enviar mensagem', detail: e.message });
  }
});


app.listen(3000, () => console.log(`🚀 API em http://localhost:3000`));