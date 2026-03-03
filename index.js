const express = require('express');
const cors = require('cors');
const wppconnect = require('@wppconnect-team/wppconnect');

const app = express();

// Segurança: CORS configurado corretamente
app.use(cors({
  origin: ['https://snref-fronten-8dbe187fda6c.herokuapp.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

let clientInstance = null;
let isReady = false;
let isInitializing = false; // Evita múltiplas tentativas de login simultâneas

console.log('Iniciando sistema de lembretes...');

async function iniciarWPP() {
  if (isInitializing) return;
  isInitializing = true;

  try {
    const client = await wppconnect.create({
      session: 'whatsapp-bot',
      catchQR: (base64Qr, asciiQR) => {
        console.log('--- NOVO QR CODE GERADO ---');
        console.log(asciiQR); // Exibe no terminal para você escanear via SSH
      },
      statusFind: (statusSession, session) => {
        console.log('Status da Sessão:', statusSession);
      },
      autoClose: 60000, // Fecha se não logar em 1 min (evita travar RAM)
      headless: true,
      useChrome: false, // Força o uso do Chromium instalado via apt
      // Argumentos críticos para rodar em Linux Server como Root
      browserArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--hide-scrollbars',
        '--mute-audio',
        '--single-process' // Economiza RAM em servidores pequenos
      ]
    });

    clientInstance = client;
    isReady = true;
    isInitializing = false;
    console.log('✅ WPPConnect pronto!');

    // 🔄 Monitoramento de estado robusto
    client.onStateChange((state) => {
      console.log('> Mudança de estado:', state);
      if (state === 'DISCONNECTED' || state === 'UNPAIRED') {
        isReady = false;
        clientInstance = null;
        console.log('⚠️ Sessão encerrada. Tentando reiniciar em 10s...');
        setTimeout(iniciarWPP, 10000);
      }
    });

  } catch (error) {
    console.error('❌ Erro fatal na inicialização:', error.message);
    isReady = false;
    isInitializing = false;
    clientInstance = null;
    // Tenta reiniciar após 15 segundos se falhar
    setTimeout(iniciarWPP, 15000);
  }
}

// Inicializa o bot
iniciarWPP();

// --- ROTAS API ---

app.get('/status', (req, res) => {
  res.json({
    status: isReady ? 'ready' : 'initializing',
    connected: !!clientInstance
  });
});

app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).json({ error: 'Número e mensagem são obrigatórios' });
  }

  if (!isReady || !clientInstance) {
    return res.status(503).json({ error: 'O bot ainda está carregando ou desconectado' });
  }

  try {
    let cleanNumber = number.replace(/\D/g, '');
    const jid = `${cleanNumber}@c.us`;

    console.log(`📨 Validando e enviando para ${jid}...`);

    // ESTA É A CORREÇÃO PARA O ERRO DE LID:
    const check = await clientInstance.checkNumberStatus(jid);

    if (!check.canReceiveMessage) {
      return res.status(404).json({ error: 'Este número não pode receber mensagens.' });
    }

    // Envia para o ID exato retornado pelo WhatsApp (que já vem com o LID correto)
    await clientInstance.sendText(check.id._serialized, message);

    return res.json({ success: true, target: check.id._serialized });
  } catch (e) {
    console.error('❌ Falha ao enviar:', e);
    return res.status(500).json({ error: 'Erro interno', detail: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API de Lembretes ativa na porta ${PORT}`);
});