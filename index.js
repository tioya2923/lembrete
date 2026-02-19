const express = require('express');
const cors = require('cors');
const wppconnect = require('@wppconnect-team/wppconnect');

const app = express();

app.use(cors({
  origin: 'https://snref-fronten-8dbe187fda6c.herokuapp.com'
}));

app.use(express.json());

let clientInstance = null;
let isReady = false;

console.log('Iniciando WPPConnect...');

function iniciarWPP() {
  wppconnect
    .create({
      session: 'whatsapp-bot',
      autoClose: 0,
      killProcessOnBrowserClose: false,
      headless: true,
      browserArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    })
    .then((client) => {
      clientInstance = client;
      isReady = true;

      console.log('WPPConnect pronto e sessão ativa!');

      // 🔄 Reconexão automática
      client.onStateChange((state) => {
        console.log('Estado do WhatsApp:', state);

        if (state === 'CONFLICT' || state === 'UNPAIRED' || state === 'UNLAUNCHED') {
          console.log('⚠️ Estado instável — aplicando forceRefocus()');
          client.forceRefocus();
        }

        if (state === 'DISCONNECTED' || state === 'UNPAIRED') {
          console.log('❌ Sessão perdida — reiniciando WPPConnect...');
          isReady = false;
          clientInstance = null;
          setTimeout(iniciarWPP, 3000);
        }
      });

      // 🔥 Captura erros internos
      client.on('error', (err) => {
        console.error('Erro no cliente WPP:', err);
        isReady = false;
        clientInstance = null;
        setTimeout(iniciarWPP, 3000);
      });

    })
    .catch((error) => {
      console.error('Erro ao iniciar WPPConnect:', error);
      isReady = false;
      clientInstance = null;
      setTimeout(iniciarWPP, 5000);
    });
}

// Iniciar WPPConnect
iniciarWPP();

// API
app.get('/status', (req, res) => {
  res.json({ status: isReady ? 'ready' : 'not_ready' });
});

app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;

  if (!isReady || !clientInstance) {
    return res.status(503).json({ error: 'Bot não está pronto (sessão não ativa)' });
  }

  try {
    const jid = `${number}@c.us`;
    console.log(`📨 Enviando mensagem para ${jid}: ${message}`);

    await clientInstance.sendText(jid, message);

    res.json({ success: true, message: 'Mensagem enviada com sucesso' });
  } catch (e) {
    console.error('Erro ao enviar mensagem:', e);
    res.status(500).json({ error: 'Erro ao enviar: ' + e.message });
  }
});

// Iniciar API
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});
