export default async function (app) {
  app.get('/', { preHandler: app.auth }, async (req) => {
    const [rows] = await app.db.query(
      'SELECT * FROM tareas WHERE ID_Usuario=:u ORDER BY Created_At DESC',
      { u: req.user.sub }
    );
    return rows;
  });

  app.post('/', { preHandler: app.auth }, async (req) => {
    const { titulo, Prioridad='Media', Etiquetas=null, Fecha_Limite=null } = req.body || {};
    const [r] = await app.db.query(
      `INSERT INTO tareas (ID_Usuario, Titulo, Prioridad, Etiquetas, Fecha_Limite, Estado)
       VALUES (:u, :t, :p, :e, :f, 'Pendiente')`,
      { u: req.user.sub, t: titulo, p: Prioridad, e: Etiquetas, f: Fecha_Limite }
    );
    return { id: r.insertId };
  });

app.post('/:id/finish', { preHandler: app.auth }, async (req, reply) => {
    const { id } = req.params;
    const userId = req.user.sub;
    const PUNTOS_POR_TAREA = 10; 

    // 1. Marca la tarea como terminada
    const [result] = await app.db.query(
      'UPDATE tareas SET Estado="Terminada" WHERE ID_Tarea=? AND ID_Usuario=?',
      [id, userId] // <-- ¡Solución! Parámetros como array
    );

    // 2. Si la tarea se actualizó, otorga puntos
    if (result.affectedRows > 0) {
      await app.db.query(
        'UPDATE usuarios SET Puntos = Puntos + ? WHERE ID_Usuario = ?',
        [PUNTOS_POR_TAREA, userId] // <-- Array (esta ya estaba bien)
      );
      
      return { ok: true, puntosGanados: PUNTOS_POR_TAREA };
    
    } else {
      return { ok: true, puntosGanados: 0, message: "La tarea no se actualizó" };
    }
  });

  app.delete('/:id', { preHandler: app.auth }, async (req) => {
    const { id } = req.params;
    await app.db.query(
      'DELETE FROM tareas WHERE ID_Tarea=? AND ID_Usuario=?',
      [id, req.user.sub] // <-- ¡Solución! Parámetros como array
    );
    return { ok: true };
  });
}
