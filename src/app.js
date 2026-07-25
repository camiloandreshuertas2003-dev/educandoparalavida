const express = require('express');
const cors = require('cors');
require('dotenv').config();

const webhookRoutes = require('./routes/webhookRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares - Capturamos el buffer rawBody para verificar firmas de webhook si es necesario
app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Manejar favicon.ico para evitar error 404 en el navegador
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Endpoint JSON para comprobaciones de salud del servidor (healthcheck)
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Bot WhatsApp Colegio - Educando para la Vida',
    timestamp: new Date().toISOString(),
  });
});

// Página visual de estado (Dashboard HTML) al visitar la raíz en el navegador
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bot WhatsApp Colegio - Educando para la Vida</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Outfit', sans-serif;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #f8fafc;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: rgba(30, 41, 59, 0.7);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 40px;
          max-width: 600px;
          width: 100%;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          text-align: center;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
          padding: 8px 16px;
          border-radius: 9999px;
          font-size: 0.9rem;
          font-weight: 600;
          margin-bottom: 20px;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .dot {
          width: 8px;
          height: 8px;
          background: #10b981;
          border-radius: 50%;
          box-shadow: 0 0 10px #10b981;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
        }
        h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 10px; color: #ffffff; }
        p { color: #94a3b8; font-size: 1rem; margin-bottom: 30px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; text-align: left; }
        .card {
          background: rgba(15, 23, 42, 0.6);
          padding: 16px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .card-label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 4px; }
        .card-value { font-size: 0.95rem; font-weight: 600; color: #e2e8f0; word-break: break-all; }
        .footer { margin-top: 30px; font-size: 0.85rem; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="badge">
          <span class="dot"></span> Servidor Backend Activo & Conectado
        </div>
        <h1>Bot WhatsApp Colegio</h1>
        <p>Educando para la Vida — Captación Automática de Leads</p>
        
        <div class="grid">
          <div class="card">
            <div class="card-label">Estado del Webhook</div>
            <div class="card-value" style="color: #10b981;">🟢 Configurado (/webhook)</div>
          </div>
          <div class="card">
            <div class="card-label">Plataforma</div>
            <div class="card-value">Vercel Serverless</div>
          </div>
          <div class="card">
            <div class="card-label">Base de Datos</div>
            <div class="card-value">MySQL (Contabo VPS)</div>
          </div>
          <div class="card">
            <div class="card-label">API WhatsApp</div>
            <div class="card-value">Meta Cloud API v20.0</div>
          </div>
        </div>

        <div class="footer">
          Última actualización: ${new Date().toLocaleString()}
        </div>
      </div>
    </body>
    </html>
  `);
});

// Rutas del Webhook de WhatsApp
app.use('/webhook', webhookRoutes);

// Para ejecución local
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(` Servidor Bot corriendo en el puerto ${PORT}`);
    console.log(` Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`===================================================`);
  });
}

// Exportar para Vercel Serverless
module.exports = app;
