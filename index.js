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

  if (!number || !message) {
    return res.status(400).json({ error: 'Número e mensagem são obrigatórios' });
  }

  if (!isReady || !clientInstance) {
    return res.status(503).json({ error: 'Servidor WhatsApp ainda não está pronto' });
  }

  try {
    // CORREÇÃO DEFINITIVA DO WID:
    // 1. Converte para string e remove TUDO que não for número
    const cleanNumber = String(number).replace(/\D/g, '');
    
    // 2. Monta o JID final estritamente como string
    const jid = `${cleanNumber}@c.us`;

    console.log(`📨 Tentando envio para JID: ${jid}`);

    // 3. Envia usando o método mais direto possível
    // Forçamos a mensagem a ser string também para evitar conflitos
    const result = await clientInstance.sendText(jid, String(message));

    console.log('✅ Mensagem enviada com sucesso!');

    return res.json({ 
        success: true, 
        messageId: result.id,
        target: jid 
    });

  } catch (e) {
    // Se o erro ainda for o de WID, vamos logar o objeto de erro inteiro para depurar
    console.error('❌ Erro detalhado no envio:', e);
    
    if (e.message && (e.message.includes('Session closed') || e.message.includes('Protocol error'))) {
        isReady = false;
        clientInstance = null;
        iniciarWPP();
    }

    return res.status(500).json({ 
      error: 'Erro ao enviar mensagem', 
      detail: e.message || e 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
});