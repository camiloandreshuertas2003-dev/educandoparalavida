const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'bot_user',
  password: process.env.DB_PASSWORD || 'tu_password_seguro',
  database: process.env.DB_NAME || 'colegio_bot',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Prueba la conexión a la base de datos
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(' Conexión exitosa a la base de datos MySQL');
    connection.release();
  } catch (error) {
    console.warn('⚠️ No se pudo conectar a MySQL (asegúrate de que MySQL esté corriendo en tu servidor Contabo):', error.message);
  }
}

testConnection();

module.exports = pool;
