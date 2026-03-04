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

console.log('--- Iniciando sistema de lembretes (WPPConnect) ---');

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
      autoClose: 0, // Mantém aberto para evitar fechar a sessão por inatividade
      tokenStore: 'file', // Salva a sessão localmente em pasta
      folderNameToken: 'tokens',
      browserArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--hide-scrollbars',
        '--mute-audio'
        // REMOVIDO: --single-process (causa instabilidade e crash de sessão)
      ]
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
    // Limpeza do número
    let cleanNumber = number.replace(/\D/g, '');
    const jid = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@c.us`;

    console.log(`📨 Enviando para: ${jid}`);

    // Validação de número (LID/ID check)
    const check = await clientInstance.checkNumberStatus(jid);

    if (!check || !check.canReceiveMessage) {
        // Fallback: se o check falhar mas o número parecer válido, tenta enviar direto
        // ou retorna erro se tiveres a certeza que o número é inválido
        return res.status(404).json({ error: 'Número inválido ou sem WhatsApp' });
    }

    // Envio da mensagem usando o ID formatado corretamente pelo WhatsApp
    const result = await clientInstance.sendText(check.id._serialized, message);

    return res.json({ 
        success: true, 
        messageId: result.id,
        target: check.id._serialized 
    });

  } catch (e) {
    console.error('❌ Erro no envio:', e.message);
    
    // Se o erro for de sessão fechada durante o envio, forçamos o restart
    if (e.message.includes('Session closed')) {
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