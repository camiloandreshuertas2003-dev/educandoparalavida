const express = require('express');
const router = express.Router();
const { verificarWebhook, recibirMensaje } = require('../controllers/webhookController');

// Verificación del webhook (GET)
router.get('/', verificarWebhook);

// Recepción de mensajes entrantes (POST)
router.post('/', recibirMensaje);

module.exports = router;
