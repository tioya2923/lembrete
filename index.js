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
      autoClose: false, // Alterado para false para maior estabilidade
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

    // Monitoramento de estado para auto-recovery
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

// Inicializa o bot
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

  if (!number || !message) {
    return res.status(400).json({ error: 'Número e mensagem são obrigatórios' });
  }

  if (!isReady || !clientInstance) {
    return res.status(503).json({ error: 'Servidor WhatsApp ainda não está pronto' });
  }

  try {
    // 1. Limpeza rigorosa do número
    let cleanNumber = number.replace(/\D/g, '');
    
    // 2. Formata o JID corretamente (ex: 351920124925@c.us)
    const jid = cleanNumber.includes('@c.us') ? cleanNumber : `${cleanNumber}@c.us`;

    console.log(`📨 Enviando mensagem para: ${jid}`);

    // 3. Envio direto usando o JID (Evita o erro de [object Object])
    // O WPPConnect valida o número internamente ao enviar
    const result = await clientInstance.sendText(jid, message);

    return res.json({ 
        success: true, 
        messageId: result.id,
        target: jid 
    });

  } catch (e) {
    console.error('❌ Erro no envio:', e.message);
    
    // Tratamento de sessão fechada
    if (e.message.includes('Session closed') || e.message.includes('Protocol error')) {
        isReady = false;
        clientInstance = null;
        iniciarWPP();
    }

    return res.status(500).json({ error: 'Erro ao enviar mensagem', detail: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
});