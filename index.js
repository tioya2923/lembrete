const express = require('express');
const cors = require('cors');
const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

// Configurações de Caminhos
const tokensDir = path.join(__dirname, 'tokens');
const sessionName = 'whatsapp-bot';

// --- FUNÇÃO DE LIMPEZA DE AMBIENTE ---
function limparAmbiente() {
  console.log('🧹 Limpando arquivos de trava e processos antigos...');
  
  const lockFiles = ['SingletonLock', 'DevToolsActivePort', 'lockfile', 'LOCK'];
  const sessionPath = path.join(tokensDir, sessionName);

  if (fs.existsSync(sessionPath)) {
    lockFiles.forEach((file) => {
      const filePath = path.join(sessionPath, file);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    });
  }

  if (process.platform === 'linux') {
    // Tenta matar processos órfãos, mas ignora erros se não houver nenhum
    try { exec('pkill -f chromium || pkill -f puppeteer || true'); } catch (e) {}
  }
}

// --- CONFIGURAÇÃO EXPRESS ---
app.use(cors({
  origin: ['https://snref-fronten-8dbe187fda6c.herokuapp.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// --- ESTADO DO BOT ---
let clientInstance = null;
let isReady = false;
let isInitializing = false;

// --- INICIALIZAÇÃO DO WHATSAPP ---
async function iniciarWPP() {
  if (isInitializing) return;
  isInitializing = true;
  isReady = false;

  limparAmbiente();

  console.log('🚀 Iniciando WPPConnect...');

  try {
    clientInstance = await wppconnect.create({
      session: sessionName,
      catchQR: (base64Qr, asciiQR) => {
        console.log('\n--- ESCANEIE O QR CODE ---');
        console.log(asciiQR);
        console.log('---------------------------\n');
      },
      statusFind: (statusSession) => {
        console.log('Status da Sessão:', statusSession);
        // Se o navegador fechar ou a sessão cair, disparar reboot
        if (['browserClose', 'autocloseCalled', 'serverDisconnect'].includes(statusSession)) {
          isReady = false;
          reboot();
        }
        if (statusSession === 'isLogged' || statusSession === 'qrReadSuccess') {
          isReady = true;
        }
      },
      headfull: false,
      autoClose: 0, 
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
          '--disable-gpu'
        ]
      }
    });

    isReady = true;
    isInitializing = false;
    console.log('✅ WPPConnect pronto para enviar mensagens!');

    // Monitoramento de Conexão Ativa
    clientInstance.onStateChange((state) => {
      console.log('Mudança de estado:', state);
      if (['DISCONNECTED', 'REJECTED', 'UNPAIRED'].includes(state)) {
        isReady = false;
        reboot();
      }
    });

  } catch (error) {
    console.error('❌ Erro fatal na inicialização:', error.message);
    isInitializing = false;
    isReady = false;
    setTimeout(iniciarWPP, 30000); 
  }
}

function reboot() {
  if (isInitializing) return;
  console.log('🔄 Reiniciando instância em 15 segundos...');
  isReady = false;
  
  if (clientInstance) {
    clientInstance.close().catch(() => {});
    clientInstance = null;
  }
  
  setTimeout(iniciarWPP, 15000);
}

// --- ENDPOINT DE ENVIO ---
app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;

  // Verificação de segurança: Se o objeto do cliente não existe ou perdeu conexão
  if (!isReady || !clientInstance) {
    return res.status(503).json({ 
      error: 'O bot não está pronto. Aguarde a reinicialização ou escaneie o QR Code.' 
    });
  }

  try {
    const cleanNumber = String(number).replace(/\D/g, '');
    const target = `${cleanNumber}@c.us`;

    // Tenta enviar a mensagem
    const result = await clientInstance.sendText(target, String(message));
    
    console.log(`✅ Mensagem enviada para ${cleanNumber}`);
    return res.json({ success: true, id: result.id });

  } catch (e) {
    console.error('❌ Erro no envio:', e.message);

    // Se o erro for de "Frame Detached" ou similar, forçamos o reboot
    if (e.message.includes('detached') || e.message.includes('Protocol error')) {
      isReady = false;
      reboot();
      return res.status(500).json({ error: 'Conexão com navegador perdida. Reiniciando bot...' });
    }

    return res.status(500).json({ error: 'Falha ao enviar', detail: e.message });
  }
});

// --- INICIALIZAÇÃO ---
app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
  iniciarWPP();
});

// Tratamento de encerramento
process.on('SIGINT', () => {
  if (clientInstance) clientInstance.close();
  process.exit();
});