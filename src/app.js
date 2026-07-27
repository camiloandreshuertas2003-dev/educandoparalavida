const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const webhookRoutes = require('./routes/webhookRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Manejar favicon.ico y favicon.png
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/favicon.png', (req, res) => res.status(204).end());

// Endpoint JSON para comprobaciones de salud (healthcheck)
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Bot WhatsApp Colegio - Educando para la Vida',
    timestamp: new Date().toISOString(),
  });
});

// Ruta pública para ver y escanear el Código QR de WhatsApp Web
app.get('/qr', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/qr.html'));
});

// Endpoints del estado del Código QR
app.get('/api/admin/qr-status', (req, res) => {
  try {
    const { getWWebStatus } = require('./services/whatsappWebService');
    res.json(getWWebStatus());
  } catch (e) {
    res.json({ status: 'disconnected', hasQr: false });
  }
});

app.post('/api/admin/qr-init', (req, res) => {
  try {
    const { initWhatsAppWeb, getWWebStatus } = require('./services/whatsappWebService');
    initWhatsAppWeb();
    res.json(getWWebStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Política de Privacidad para Meta WhatsApp Cloud API
app.get('/politica-privacidad', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/politica-privacidad.html'));
});

// Rutas de la API de Administración del Panel de Control
app.use('/api/admin', adminRoutes);

// Rutas del Webhook de WhatsApp
app.use('/webhook', webhookRoutes);

// Servir archivos estáticos de public
app.use(express.static(path.join(__dirname, '../public')));

// Servir la SPA del Panel de Control en rutas explícitas de string
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/panel', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Para ejecución local o en servidor VPS (Contabo)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(` Servidor Bot & Panel Admin corriendo en el puerto ${PORT}`);
    console.log(` Panel Web: http://localhost:${PORT}`);
    console.log(` Vincular WhatsApp QR: http://localhost:${PORT}/qr`);
    console.log(` Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`===================================================`);

    // Inicializar cliente de WhatsApp Web en servidores Node continuos
    try {
      const { initWhatsAppWeb } = require('./services/whatsappWebService');
      initWhatsAppWeb();
    } catch (e) {
      console.warn('⚠️ Nota sobre WhatsApp Web:', e.message);
    }
  });
}

// Exportar para Vercel Serverless
module.exports = app;
