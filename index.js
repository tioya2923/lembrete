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
    // 1. Definição do destino (Forçando LID se já soubermos qual é)
    // Se o seu número for sempre o mesmo, podemos até fixar aqui para teste
    let target = "77919313481733@lid"; 
    
    // Se quiser manter dinâmico para outros números:
    // let cleanNumber = String(number).replace(/\D/g, '');
    // let target = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@c.us`;

    console.log(`📨 Enviando DIRETAMENTE para o LID: ${target}`);

    // 2. Envio usando a função de chat direto (mais baixo nível e estável)
    const result = await clientInstance.sendText(String(target), String(message));

    return res.json({ success: true, messageId: result.id, sentTo: target });

  } catch (e) {
    console.error('❌ Erro no envio:', e);
    
    // Fallback caso o erro de WID retorne o ID correto no objeto
    if (e.id && e.id.id) {
       const lid = String(e.id.id);
       console.log(`🔄 Tentativa automática com ID recuperado: ${lid}`);
       const retry = await clientInstance.sendText(lid, String(message));
       return res.json({ success: true, messageId: retry.id, sentTo: lid });
    }

    return res.status(500).json({ error: 'Erro fatal', detail: e.message || e });
  }
});

app.listen(3000, () => console.log(`🚀 API em http://localhost:3000`));