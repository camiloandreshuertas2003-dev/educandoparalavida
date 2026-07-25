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

// Manejar favicon.ico
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Endpoint JSON para comprobaciones de salud (healthcheck)
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Bot WhatsApp Colegio - Educando para la Vida (Fase 2)',
    timestamp: new Date().toISOString(),
  });
});

// Rutas de la API de Administración del Panel de Control
app.use('/api/admin', adminRoutes);

// Rutas del Webhook de WhatsApp
app.use('/webhook', webhookRoutes);

// Servir la SPA del Panel de Control en la raíz y en /panel
app.use(express.static(path.join(__dirname, '../public')));

app.get(['/', '/panel', '/admin'], (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Para ejecución local
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(` Servidor Bot & Panel Admin corriendo en el puerto ${PORT}`);
    console.log(` Panel Web: http://localhost:${PORT}`);
    console.log(` Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`===================================================`);
  });
}

// Exportar para Vercel Serverless
module.exports = app;
