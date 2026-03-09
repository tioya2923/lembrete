
const express = require('express');
const cors = require('cors');
const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');

// Remover arquivos de lock e tentar matar processos Chromium/Puppeteer
const lockFiles = [
  'SingletonLock',
  'DevToolsActivePort',
  'lockfile',
  'LOCK'
];
const lockDir = path.join(__dirname, 'tokens', 'whatsapp-bot');
lockFiles.forEach((file) => {
  const filePath = path.join(lockDir, file);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Arquivo ${file} removido automaticamente.`);
    }
  } catch (e) {
    console.error(`Erro ao remover ${file}:`, e.message);
  }
});

// Tentar matar processos Chromium/Puppeteer (Linux)
if (process.platform === 'linux') {
  const { exec } = require('child_process');
  exec('pkill -f chromium || pkill -f puppeteer || true', (err, stdout, stderr) => {
    if (err) {
      console.error('Erro ao tentar matar processos Chromium/Puppeteer:', err.message);
    } else {
      if (stdout) console.log('Processos Chromium/Puppeteer finalizados:', stdout);
      if (stderr) console.log('Saída stderr:', stderr);
    }
  });
}

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
let browserClosed = false;
let lastInit = 0;

// Handler para finalizar o clientInstance ao encerrar o processo
async function closeClientInstance() {
  if (clientInstance && typeof clientInstance.close === 'function') {
    try {
      await clientInstance.close();
      console.log('✅ ClientInstance fechado corretamente.');
    } catch (e) {
      console.error('Erro ao fechar clientInstance:', e.message);
    }
  }
}

process.on('SIGINT', async () => {
  await closeClientInstance();
  process.exit();
});
process.on('SIGTERM', async () => {
  await closeClientInstance();
  process.exit();
});


async function iniciarWPP() {
  if (isInitializing) return;
  if (Date.now() - lastInit < 10000) return; // evita loops rápidos
  isInitializing = true;
  lastInit = Date.now();
  browserClosed = false;

  try {
    const client = await wppconnect.create({
      session: 'whatsapp-bot',
      catchQR: (base64Qr, asciiQR) => {
        console.log('\n--- NOVO QR CODE GERADO ---\n' + asciiQR + '\n---------------------------\n');
      },
      statusFind: (statusSession) => console.log('Status da Sessão:', statusSession),
      headfull: false,
        autoClose: 360, // QR permanece aberto por 6 minutos
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

    // Reconexão automática em eventos críticos
    client.onStateChange((state) => {
      console.log('Estado da conexão:', state);
      if (
        state === 'DISCONNECTED' ||
        state === 'UNPAIRED' ||
        state === 'CLOSED' ||
        state === 'CONFLICT' ||
        state === 'UNLAUNCHED' ||
        state === 'browserClose' // Corrigido para reiniciar também neste estado
      ) {
        isReady = false;
        clientInstance = null;
        setTimeout(iniciarWPP, 15000);
      }
    });

    client.onStreamChange((state) => {
      console.log('Stream alterado:', state);
      if (state === 'DISCONNECTED' || state === 'SYNCING') {
        isReady = false;
        clientInstance = null;
        setTimeout(iniciarWPP, 15000);
      }
    });

    // Detecta fechamento do navegador
    if (client && client.page && client.page.browser) {
      client.page.browser().on('disconnected', () => {
        console.error('Navegador fechado! Reiniciando bot...');
        browserClosed = true;
        isReady = false;
        clientInstance = null;
        setTimeout(iniciarWPP, 15000);
      });
    }

    // Captura erros não tratados
    process.on('unhandledRejection', (reason, p) => {
      console.error('Unhandled Rejection:', reason);
    });
    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
    });

  } catch (error) {
    console.error('Erro na inicialização:', error);
    isReady = false;
    clientInstance = null;
    isInitializing = false;
    setTimeout(iniciarWPP, 20000);
  }
}

iniciarWPP();


app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;

  if (!isReady || !clientInstance || browserClosed) {
    return res.status(503).json({ error: 'Bot não pronto ou sessão fechada' });
  }

  try {
    const cleanNumber = String(number).replace(/\D/g, '');
    const target = `${cleanNumber}@c.us`;

    console.log(`🚀 Enviando mensagem para: ${target}`);

    // Verifica se a sessão está ativa antes de enviar
    if (typeof clientInstance.getConnectionState === 'function') {
      const state = await clientInstance.getConnectionState();
      if (state !== 'CONNECTED') {
        throw new Error('Sessão não está conectada');
      }
    }

    const result = await clientInstance.sendText(target, String(message));

    console.log('✅ Mensagem enviada!');
    return res.json({ success: true, id: result.id });

  } catch (e) {
    // Se for erro de sessão fechada, reinicia o bot
    if (e.message && e.message.includes('Session closed')) {
      isReady = false;
      clientInstance = null;
      setTimeout(iniciarWPP, 5000);
    }
    console.error('❌ Erro ao enviar mensagem:', e.message);
    return res.status(500).json({ error: 'Erro ao enviar mensagem', detail: e.message });
  }
});


app.listen(3000, () => console.log(`🚀 API em http://localhost:3000`));