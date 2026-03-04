const express = require('express');
const cors = require('cors');
const wppconnect = require('@wppconnect-team/wppconnect');

const app = express();

// Segurança: CORS configurado
app.use(cors({
  origin: ['https://snref-fronten-8dbe187fda6c.herokuapp.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

let clientInstance = null;
let isReady = false;
let isInitializing = false;

console.log('--- Iniciando sistema de lembretes (WPPConnect v24.04 ARM) ---');

async function iniciarWPP() {
  if (isInitializing) return;
  isInitializing = true;

  try {
    const client = await wppconnect.create({
      session: 'whatsapp-bot',
      catchQR: (base64Qr, asciiQR) => {
        console.log('\n--- NOVO QR CODE GERADO ---');
        console.log(asciiQR); 
        console.log('---------------------------\n');
      },
      statusFind: (statusSession, session) => {
        console.log('Status da Sessão:', statusSession);
      },
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
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--hide-scrollbars',
          '--mute-audio',
          '--single-process',
          '--disable-features=IsolateOrigins,site-per-process'
        ],
      }
    });

    clientInstance = client;
    isReady = true;
    isInitializing = false;
    console.log('✅ WPPConnect pronto e autenticado!');

    client.onStateChange((state) => {
      console.log('> Estado atual:', state);
      if (state === 'DISCONNECTED' || state === 'UNPAIRED') {
        isReady = false;
        clientInstance = null;
        console.log('⚠️ Conexão perdida. Reiniciando em 15s...');
        setTimeout(iniciarWPP, 15000);
      }
    });

  } catch (error) {
    console.error('❌ Erro na inicialização:', error.message);
    isReady = false;
    isInitializing = false;
    clientInstance = null;
    setTimeout(iniciarWPP, 20000);
  }
}

iniciarWPP();

// --- ROTAS API ---

app.get('/status', (req, res) => {
  res.json({
    status: isReady ? 'ready' : 'initializing',
    connected: !!clientInstance,
    timestamp: new Date().toISOString()
  });
});

app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;

  if (!isReady || !clientInstance) {
    return res.status(503).json({ error: 'Servidor não pronto' });
  }

  try {
    // 1. Limpeza total
    let cleanNumber = String(number).replace(/\D/g, '');
    
    // 2. LÓGICA DE DETECÇÃO DE LID/JID
    // Se o número for muito longo (comum em LIDs), o WPPConnect às vezes falha.
    // Vamos tentar o envio usando a string pura.
    const jid = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@c.us`;

    console.log(`📨 Tentando envio para: ${jid}`);

    // 3. USO DO MÉTODO INTERNO PARA GARANTIR COMPATIBILIDADE
    const result = await clientInstance.sendText(jid, String(message), {
        waitForAck: true,
        isGroup: false
    });

    return res.json({ 
        success: true, 
        messageId: result.id 
    });

  } catch (e) {
    console.error('❌ Erro no envio:', e);
    
    // TRATAMENTO PARA NÚMEROS COM LID (Caso o erro persista)
    if (e.code === 'invalid_wid' && e.id) {
        try {
            console.log(`🔄 Tentando fallback para LID detectado: ${e.id.id}`);
            const retry = await clientInstance.sendText(e.id.id, String(message));
            return res.json({ success: true, messageId: retry.id, note: 'sent_via_lid' });
        } catch (retryErr) {
            return res.status(500).json({ error: 'Erro no fallback LID', detail: retryErr.message });
        }
    }

    return res.status(500).json({ error: 'Erro ao enviar', detail: e.message || e });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
});