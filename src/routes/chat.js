export default async function (app) {
  // Inbox simple: últimos mensajes por conversación (privada o de grupos donde está el usuario)
  app.get('/inbox', { preHandler: app.auth }, async (req) => {
    const userId = req.user.sub;
    // últimos 50 mensajes donde participa (privados o grupos del usuario)
    const [rows] = await app.db.query(
      `
      SELECT c.*, u.Nombre as EmisorNombre
      FROM chat c
      JOIN usuarios u ON u.ID_Usuario = c.ID_Emisor
      WHERE (c.ID_Emisor=:uid AND c.ID_Receptor=:other)
      OR (c.ID_Emisor=:other AND c.ID_Receptor=:uid)
      ORDER BY c.FechaEnvio ASC
      LIMIT 50
      `,
      { uid: userId }
    );
    return rows;
  });

  // Historial 1-1
  app.get('/with/:otherId', { preHandler: app.auth }, async (req) => {
    const { otherId } = req.params;
    const uid = req.user.sub;
    const [rows] = await app.db.query(
      `SELECT * FROM chat 
       WHERE (ID_Emisor=:uid AND ID_Receptor=:other)
          OR (ID_Emisor=:other AND ID_Receptor=:uid)
       ORDER BY FechaEnvio ASC`,
      { uid, other: otherId }
    );
    return rows;
  });

  // Enviar mensaje 1-1  (texto/imagen/audio/archivo/ubicacion con {contenido,url})
  app.post('/send', { preHandler: app.auth }, async (req, reply) => {
    const { receptorId, grupoId, mensaje, tipo='texto', url } = req.body || {};
    if (!receptorId && !grupoId) return reply.code(400).send({ error: 'receptorId o grupoId requerido' });
    const payload = tipo === 'texto' ? mensaje : (url || mensaje);
    await app.db.query(
      `INSERT INTO chat (ID_Emisor, ID_Receptor, ID_Grupo, Mensaje, Tipo, Entregado) 
       VALUES (:e, :r, :g, :m, :t, 1)`,
      { e: req.user.sub, r: receptorId || null, g: grupoId || null, m: payload, t: tipo }
    );
    return { ok: true };
  });

  // Mensajes de un grupo
  app.get('/group/:groupId', { preHandler: app.auth }, async (req, reply) => {
    const { groupId } = req.params;
    // checa membresía
    const [m] = await app.db.query(
      'SELECT 1 FROM usuarios_grupos WHERE ID_Usuario=:u AND ID_Grupo=:g LIMIT 1',
      { u: req.user.sub, g: groupId }
    );
    if (!m.length) return reply.code(403).send({ error: 'No miembro del grupo' });
    const [rows] = await app.db.query(
      'SELECT * FROM chat WHERE ID_Grupo=:g ORDER BY FechaEnvio ASC',
      { g: groupId }
    );
    return rows;
  });
}
