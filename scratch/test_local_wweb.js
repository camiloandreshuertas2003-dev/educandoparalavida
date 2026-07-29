const { initWhatsAppWeb, getWWebStatus } = require('../src/services/whatsappWebService');

console.log('⚡ Probando inicialización local de WhatsApp Web...');

async function testLocal() {
  try {
    await initWhatsAppWeb();
    setTimeout(() => {
      const status = getWWebStatus();
      console.log('📊 ESTADO LOCAL:', status);
      process.exit(0);
    }, 4000);
  } catch (err) {
    console.error('❌ ERROR EN PRUEBA LOCAL:', err.message);
    process.exit(1);
  }
}

testLocal();
