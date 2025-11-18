export default async function (app) {
  // Tipos disponibles
  app.get('/types', { preHandler: app.auth }, async (req) => {
    const [rows] = await app.db.query('SELECT * FROM tiposrecompensa WHERE Activo=1');
    return rows;
  });

  // Mis recompensas
  app.get('/me', { preHandler: app.auth }, async (req) => {
    const [rows] = await app.db.query(
      `SELECT r.ID_Recompensa, tr.Nombre, tr.Descripcion, r.Fecha
       FROM recompensas r
       JOIN tiposrecompensa tr ON tr.ID_TipoRecompensa=r.ID_TipoRecompensa
       WHERE r.ID_Usuario=:u
       ORDER BY r.Fecha DESC`,
      { u: req.user.sub }
    );
    return rows;
  });

  // Asignar (para demo: cualquiera puede otorgarse; en real, restringe a Admin)
  app.post('/give', { preHandler: app.auth }, async (req) => {
    const { tipoId, toUserId } = req.body || {};
    await app.db.query(
      'INSERT INTO recompensas (ID_Usuario, ID_TipoRecompensa) VALUES (:u, :t)',
      { u: toUserId ?? req.user.sub, t: tipoId }
    );
    return { ok: true };
  });


 

  // ▼▼▼ AÑADE ESTA NUEVA RUTA ▼▼▼
  // Leaderboard (visible para todos)
  app.get('/leaderboard', { preHandler: app.auth }, async (req) => {
    // 1. Llama a la tabla de usuarios
    const [rows] = await app.db.query(
      `SELECT ID_Usuario, Nombre, Apellido, Nivel, Puntos 
       FROM usuarios
       WHERE EstadoCuenta = 'Activo'
       ORDER BY Puntos DESC, Nivel DESC 
       LIMIT 50` // Limita a los 50 mejores
    );
    return rows;
  });
  // ▲▲▲ FIN DE LA NUEVA RUTA ▲▲▲

// ... (tu ruta GET /leaderboard va aquí) ...

  // ▼▼▼ AÑADE ESTA NUEVA RUTA ▼▼▼
  // Ruta para que el simulador reporte puntos ganados
  app.post('/tournament', { preHandler: app.auth }, async (req, reply) => {
    // El simulador nos dirá cuántos puntos ganó el usuario
    const { puntosGanados } = req.body;
    const userId = req.user.sub;

    if (!puntosGanados || typeof puntosGanados !== 'number' || puntosGanados <= 0) {
      return reply.code(400).send({ error: 'La cantidad de puntos no es válida.' });
    }

    try {
      // 1. Suma los puntos al usuario
      await app.db.query(
        'UPDATE usuarios SET Puntos = Puntos + ? WHERE ID_Usuario = ?',
        [puntosGanados, userId]
      );
      
      // 2. Opcional: Registra el logro (si quieres)
      // await app.db.query('INSERT INTO tiposrecompensa (ID_Usuario, ...) ...');

      return { ok: true };

    } catch (error) {
      console.error("Error al dar puntos de torneo:", error);
      return reply.code(500).send({ error: "Error interno del servidor" });
    }
  });



} // <-- Esta es la llave de cierre de tu 'export default'


