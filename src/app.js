const express = require('express');
const cors = require('cors');
require('dotenv').config();

const webhookRoutes = require('./routes/webhookRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta principal de salud / comprobación
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    app: 'Bot WhatsApp Colegio - Educando para la Vida',
    timestamp: new Date().toISOString(),
  });
});

// Rutas del Webhook de WhatsApp
app.use('/webhook', webhookRoutes);

// Iniciar Servidor
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(` Servidor Bot corriendo en el puerto ${PORT}`);
  console.log(` Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`===================================================`);
});
