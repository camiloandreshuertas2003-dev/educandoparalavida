const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { autenticarToken, esAdmin } = require('../middlewares/authMiddleware');

// Ruta Pública: Autenticación
router.post('/auth/login', adminController.login);

// Rutas Protegidas (requieren JWT de Admin)
router.use(autenticarToken);

// Dashboard y Kanban
router.get('/stats', adminController.getStats);
router.get('/kanban', adminController.getKanban);

// Gestión de Leads
router.get('/leads', adminController.getLeads);
router.put('/leads/:id', adminController.updateLead);
router.delete('/leads/:id', esAdmin, adminController.deleteLead);

// Oferta Académica (Grados y Paquetes)
router.get('/grados', adminController.getGrados);
router.post('/grados', esAdmin, adminController.saveGrado);
router.delete('/grados/:id', esAdmin, adminController.deleteGrado);

router.get('/paquetes', adminController.getPaquetes);
router.post('/paquetes', esAdmin, adminController.savePaquete);
router.delete('/paquetes/:id', esAdmin, adminController.deletePaquete);

// Configuración del Bot (Textos Administrables)
router.get('/bot-mensajes', adminController.getBotMensajes);
router.post('/bot-mensajes', esAdmin, adminController.saveBotMensaje);
router.put('/bot-mensajes/:id', esAdmin, adminController.saveBotMensaje);
router.delete('/bot-mensajes/:id', esAdmin, adminController.deleteBotMensaje);

// Base de Conocimiento (FAQs)
router.get('/base-conocimiento', adminController.getBaseConocimiento);
router.post('/base-conocimiento', esAdmin, adminController.saveBaseConocimiento);
router.delete('/base-conocimiento/:id', esAdmin, adminController.deleteBaseConocimiento);

// Conversaciones y Chats
router.get('/conversaciones', adminController.getConversaciones);
router.get('/conversaciones/:telefono/logs', adminController.getMensajesLog);

module.exports = router;
