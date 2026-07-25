const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { JWT_SECRET } = require('../middlewares/authMiddleware');

// 1. AUTENTICACIÓN: Login de usuarios del panel
async function login(req, res) {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({ error: 'Por favor ingrese correo y contraseña' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM usuarios_panel WHERE correo = ? AND activo = TRUE', [correo]);
    
    // Si no hay usuarios en la tabla (ej. recién instalada), creamos el admin por defecto
    if (rows.length === 0 && correo === 'admin@educandoparalavida.edu.co' && password === 'admin12345') {
      const hash = await bcrypt.hash('admin12345', 10);
      await pool.query(
        'INSERT INTO usuarios_panel (nombre, correo, password_hash, rol) VALUES (?, ?, ?, ?)',
        ['Administrador Colegio', 'admin@educandoparalavida.edu.co', hash, 'admin']
      );
      const token = jwt.sign({ id: 1, nombre: 'Administrador Colegio', correo, rol: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
      return res.json({ token, user: { id: 1, nombre: 'Administrador Colegio', correo, rol: 'admin' } });
    }

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const usuario = rows[0];
    const passwordMatch = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      token,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
      },
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error del servidor en autenticación' });
  }
}

// 2. DASHBOARD: Estadísticas generales
async function getStats(req, res) {
  try {
    const [[{ totalLeads }]] = await pool.query('SELECT COUNT(*) as totalLeads FROM leads_fase2');
    const [[{ leadsNuevos }]] = await pool.query("SELECT COUNT(*) as leadsNuevos FROM leads_fase2 WHERE estado_embudo = 'nuevo'");
    const [[{ totalConversaciones }]] = await pool.query('SELECT COUNT(*) as totalConversaciones FROM conversaciones');
    
    // Leads agrupados por grado
    const [leadsPorGrado] = await pool.query(`
      SELECT COALESCE(g.nombre, 'Sin definir') as grado, COUNT(l.id) as cantidad
      FROM leads_fase2 l
      LEFT JOIN grados g ON l.grado_interes_id = g.id
      GROUP BY l.grado_interes_id, g.nombre
      ORDER BY cantidad DESC
    `);

    res.json({
      totalLeads,
      leadsNuevos,
      totalConversaciones,
      leadsPorGrado,
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener métricas del servidor' });
  }
}

// 3. LEADS: Consultar y actualizar
async function getLeads(req, res) {
  try {
    const { estado, buscar } = req.query;
    let query = `
      SELECT l.*, g.nombre as grado_nombre, p.nombre as paquete_nombre
      FROM leads_fase2 l
      LEFT JOIN grados g ON l.grado_interes_id = g.id
      LEFT JOIN paquetes p ON l.paquete_interes_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (estado) {
      query += ' AND l.estado_embudo = ?';
      params.push(estado);
    }

    if (buscar) {
      query += ' AND (l.nombre_contacto LIKE ? OR l.telefono LIKE ? OR l.nombre_estudiante LIKE ?)';
      const term = `%${buscar}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY l.fecha_registro DESC LIMIT 100';

    const [leads] = await pool.query(query, params);
    res.json(leads);
  } catch (error) {
    console.error('Error obteniendo leads:', error);
    res.status(500).json({ error: 'Error consultando la lista de leads' });
  }
}

async function updateLead(req, res) {
  const { id } = req.params;
  const { estado_embudo, notas_internas, nombre_estudiante, edad_estudiante } = req.body;

  try {
    await pool.query(
      `UPDATE leads_fase2 
       SET estado_embudo = COALESCE(?, estado_embudo),
           notas_internas = COALESCE(?, notas_internas),
           nombre_estudiante = COALESCE(?, nombre_estudiante),
           edad_estudiante = COALESCE(?, edad_estudiante)
       WHERE id = ?`,
      [estado_embudo, notas_internas, nombre_estudiante, edad_estudiante, id]
    );
    res.json({ message: 'Lead actualizado correctamente' });
  } catch (error) {
    console.error('Error actualizando lead:', error);
    res.status(500).json({ error: 'Error al actualizar el lead' });
  }
}

// 4. GRADOS Y NIVELES: Listar y guardar
async function getGrados(req, res) {
  try {
    const [grados] = await pool.query(`
      SELECT g.*, n.nombre as nivel_nombre 
      FROM grados g
      JOIN niveles_educativos n ON g.nivel_id = n.id
      ORDER BY n.orden ASC, g.orden ASC
    `);
    res.json(grados);
  } catch (error) {
    console.error('Error obteniendo grados:', error);
    res.status(500).json({ error: 'Error obteniendo la lista de grados' });
  }
}

async function saveGrado(req, res) {
  const { id, nivel_id, nombre, orden, activo } = req.body;
  try {
    if (id) {
      await pool.query('UPDATE grados SET nivel_id=?, nombre=?, orden=?, activo=? WHERE id=?', [nivel_id, nombre, orden, activo, id]);
    } else {
      await pool.query('INSERT INTO grados (nivel_id, nombre, orden, activo) VALUES (?, ?, ?, ?)', [nivel_id, nombre, orden || 0, activo ?? true]);
    }
    res.json({ message: 'Grado guardado con éxito' });
  } catch (error) {
    console.error('Error guardando grado:', error);
    res.status(500).json({ error: 'Error al guardar el grado' });
  }
}

// 5. PAQUETES EDUCATIVOS: Listar y guardar
async function getPaquetes(req, res) {
  try {
    const [paquetes] = await pool.query(`
      SELECT p.*, g.nombre as grado_nombre 
      FROM paquetes p
      LEFT JOIN grados g ON p.grado_id = g.id
      ORDER BY p.id DESC
    `);
    res.json(paquetes);
  } catch (error) {
    console.error('Error obteniendo paquetes:', error);
    res.status(500).json({ error: 'Error al obtener paquetes' });
  }
}

async function savePaquete(req, res) {
  const { id, nombre, grado_id, descripcion, incluye, precio, periodicidad_pago, activo } = req.body;
  try {
    if (id) {
      await pool.query(
        'UPDATE paquetes SET nombre=?, grado_id=?, descripcion=?, incluye=?, precio=?, periodicidad_pago=?, activo=? WHERE id=?',
        [nombre, grado_id || null, descripcion, incluye, precio, periodicidad_pago, activo, id]
      );
    } else {
      await pool.query(
        'INSERT INTO paquetes (nombre, grado_id, descripcion, incluye, precio, periodicidad_pago, activo) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [nombre, grado_id || null, descripcion, incluye, precio, periodicidad_pago || 'mensual', activo ?? true]
      );
    }
    res.json({ message: 'Paquete guardado con éxito' });
  } catch (error) {
    console.error('Error guardando paquete:', error);
    res.status(500).json({ error: 'Error al guardar el paquete' });
  }
}

// 6. MENSAJES DEL BOT: Listar y editar
async function getBotMensajes(req, res) {
  try {
    const [mensajes] = await pool.query('SELECT * FROM bot_mensajes ORDER BY id ASC');
    res.json(mensajes);
  } catch (error) {
    console.error('Error obteniendo mensajes del bot:', error);
    res.status(500).json({ error: 'Error al obtener mensajes del bot' });
  }
}

async function updateBotMensaje(req, res) {
  const { id } = req.params;
  const { contenido, activo } = req.body;
  try {
    await pool.query('UPDATE bot_mensajes SET contenido=?, activo=? WHERE id=?', [contenido, activo, id]);
    res.json({ message: 'Mensaje del bot actualizado con éxito' });
  } catch (error) {
    console.error('Error actualizando mensaje del bot:', error);
    res.status(500).json({ error: 'Error al actualizar mensaje del bot' });
  }
}

// 7. CONVERSACIONES Y LOGS
async function getConversaciones(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, 
        (SELECT contenido FROM mensajes_log WHERE telefono = c.telefono ORDER BY id DESC LIMIT 1) as ultimo_mensaje,
        (SELECT creado_en FROM mensajes_log WHERE telefono = c.telefono ORDER BY id DESC LIMIT 1) as fecha_ultimo_mensaje
      FROM conversaciones c
      ORDER BY fecha_ultimo_mensaje DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error obteniendo conversaciones:', error);
    res.status(500).json({ error: 'Error al consultar conversaciones' });
  }
}

async function getMensajesLog(req, res) {
  const { telefono } = req.params;
  try {
    const [logs] = await pool.query(
      'SELECT * FROM mensajes_log WHERE telefono = ? ORDER BY id ASC LIMIT 100',
      [telefono]
    );
    res.json(logs);
  } catch (error) {
    console.error('Error obteniendo logs de chat:', error);
    res.status(500).json({ error: 'Error obteniendo historial de chat' });
  }
}

module.exports = {
  login,
  getStats,
  getLeads,
  updateLead,
  getGrados,
  saveGrado,
  getPaquetes,
  savePaquete,
  getBotMensajes,
  updateBotMensaje,
  getConversaciones,
  getMensajesLog,
};
