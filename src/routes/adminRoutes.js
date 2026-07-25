const express = require('express');
const router = express.Router();
const { autenticarToken, esAdmin } = require('../middlewares/authMiddleware');
const adminController = require('../controllers/adminController');

// Ruta pública de autenticación
router.post('/auth/login', adminController.login);

// Rutas protegidas (Requieren Token JWT)
router.use(autenticarToken);

// Estadísticas del Dashboard
router.get('/stats', adminController.getStats);

// Gestión de Leads
router.get('/leads', adminController.getLeads);
router.put('/leads/:id', adminController.updateLead);

// Gestión de Grados y Paquetes
router.get('/grados', adminController.getGrados);
router.post('/grados', adminController.saveGrado);

router.get('/paquetes', adminController.getPaquetes);
router.post('/paquetes', adminController.savePaquete);

// Configuración de Mensajes del Bot
router.get('/bot-mensajes', adminController.getBotMensajes);
router.put('/bot-mensajes/:id', adminController.updateBotMensaje);

// Conversaciones y Chat History
router.get('/conversaciones', adminController.getConversaciones);
router.get('/conversaciones/:telefono/logs', adminController.getMensajesLog);

module.exports = router;
