const express = require('express');
const cors = require('cors');
const app = express();
const wppconnect = require('@wppconnect-team/wppconnect');

app.use(cors({
  origin: 'https://snref-fronten-8dbe187fda6c.herokuapp.com'
}));
app.use(express.json());

let clientInstance = null;

console.log('Iniciando WPPConnect...');

// Configuração compatível com Heroku
wppconnect
  .create({
    session: 'whatsapp-bot',
    autoClose: 0, // QR nunca expira
    headless: true, // OBRIGATÓRIO no Heroku
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
    // NÃO defina useChrome, nem executablePath
  })
  .then((client) => {
    clientInstance = client;
    console.log('WPPConnect pronto!');

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`API rodando na porta ${PORT}`);
    });
  })
  .catch((error) => console.error(error));

app.get('/status', (req, res) => {
  res.json({ status: clientInstance ? 'ready' : 'not_ready' });
});

app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;

  if (!clientInstance) {
    return res.status(503).json({ error: 'Bot não está pronto' });
  }

  try {
    await clientInstance.sendText(`${number}@c.us`, message);
    res.send('Mensagem enviada com sucesso');
  } catch (e) {
    res.status(500).send('Erro ao enviar: ' + e.message);
  }
});
