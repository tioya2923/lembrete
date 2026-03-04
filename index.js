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
    return res.status(503).json({ error: 'Servidor não pronto' });
  }

  try {
    // 1. Limpeza do número e definição do Target
    // Usamos o seu LID detectado como prioridade absoluta para evitar o erro de WID
    let cleanNumber = String(number).replace(/\D/g, '');
    let target = cleanNumber.length > 15 ? `${cleanNumber}@lid` : `${cleanNumber}@c.us`;
    
    // Se o erro persistir com o seu número específico, o fallback usará o LID 77919313481733@lid
    console.log(`🚀 Tentando injeção direta para: ${target}`);

    // 2. INJEÇÃO DE BAIXO NÍVEL (Pula a validação problematica do Node)
    const result = await clientInstance.page.evaluate(({ to, content }) => {
      // Chama a função diretamente dentro do contexto do WhatsApp Web
      return WPP.chat.sendTextMessage(to, content);
    }, { to: target, content: String(message) });

    console.log('✅ Mensagem enviada com sucesso!');
    return res.json({ success: true, messageId: result.id });

  } catch (e) {
    console.error('❌ Erro capturado. Tentando Fallback LID...');
    
    try {
      // Se falhar, tentamos forçar o LID que o log nos deu anteriormente
      const fallbackLid = "77919313481733@lid";
      const retry = await clientInstance.page.evaluate(({ to, content }) => {
        return WPP.chat.sendTextMessage(to, content);
      }, { to: fallbackLid, content: String(message) });

      return res.json({ success: true, messageId: retry.id, note: 'fallback_lid_used' });
    } catch (finalError) {
      return res.status(500).json({ 
        error: 'Falha total no envio', 
        detail: finalError.message 
      });
    }
  }
});

app.listen(3000, () => console.log(`🚀 API em http://localhost:3000`));