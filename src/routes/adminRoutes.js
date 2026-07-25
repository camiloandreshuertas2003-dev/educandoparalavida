const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verificarToken, esAdmin } = require('../middlewares/authMiddleware');

// Ruta Pública: Autenticación
router.post('/auth/login', adminController.login);

// Rutas Protegidas (requieren JWT de Admin)
router.use(verificarToken);

// Dashboard y Kanban
router.get('/stats', adminController.getStats);
router.get('/kanban', adminController.getKanban);

// Gestión de Leads
router.get('/leads', adminController.getLeads);
router.put('/leads/:id', adminController.updateLead);

// Oferta Académica (Grados y Paquetes)
router.get('/grados', adminController.getGrados);
router.post('/grados', esAdmin, adminController.saveGrado);

router.get('/paquetes', adminController.getPaquetes);
router.post('/paquetes', esAdmin, adminController.savePaquete);

// Configuración del Bot & Base de Conocimiento (FAQs)
router.get('/bot-mensajes', adminController.getBotMensajes);
router.put('/bot-mensajes/:id', esAdmin, adminController.updateBotMensaje);

router.get('/base-conocimiento', adminController.getBaseConocimiento);
router.post('/base-conocimiento', esAdmin, adminController.saveBaseConocimiento);

// Conversaciones y Chats
router.get('/conversaciones', adminController.getConversaciones);
router.get('/conversaciones/:telefono/logs', adminController.getMensajesLog);

module.exports = router;
