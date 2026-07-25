const mysql = require('mysql2/promise');
require('dotenv').config();

let poolConfig = {};

function getIndividualConfig() {
  return {
    host: process.env.DB_HOST || '213.136.93.164',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'ki11745159_educandoparalavida1',
    password: process.env.DB_PASSWORD || '39?KIO1zZqo[ZH5?',
    database: process.env.DB_NAME || 'ki11745159_educandoparalavida',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 2500, // 2.5 segundos máximo de espera para no bloquear Vercel Serverless
  };
}

if (process.env.DATABASE_URL) {
  try {
    const dbUrl = new URL(process.env.DATABASE_URL);
    poolConfig = {
      host: dbUrl.hostname,
      port: dbUrl.port ? Number(dbUrl.port) : 3306,
      user: decodeURIComponent(dbUrl.username),
      password: decodeURIComponent(dbUrl.password),
      database: dbUrl.pathname.replace(/^\//, ''),
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 2500,
    };
  } catch (err) {
    console.error('Error parseando DATABASE_URL:', err.message);
    poolConfig = getIndividualConfig();
  }
} else {
  poolConfig = getIndividualConfig();
}

const pool = mysql.createPool(poolConfig);

// Prueba la conexión a la base de datos de forma no bloqueante
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(' Conexión exitosa a la base de datos MySQL');
    connection.release();
  } catch (error) {
    console.warn('⚠️ Nota sobre MySQL (Servidor no responde a tiempo, usando fallback):', error.message);
  }
}

testConnection();

module.exports = pool;
