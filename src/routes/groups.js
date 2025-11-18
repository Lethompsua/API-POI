export default async function (app) {
  app.post('/', { preHandler: app.auth }, async (req) => {
    const { nombre } = req.body || {};
    const [r] = await app.db.query(
      'INSERT INTO grupos (NombreGrupo, ID_Creador) VALUES (:n, :c)',
      { n: nombre, c: req.user.sub }
    );
    // agregar creador como admin
    await app.db.query(
      'INSERT INTO usuarios_grupos (ID_Usuario, ID_Grupo, RolGrupo) VALUES (:u, :g, "Admin")',
      { u: req.user.sub, g: r.insertId }
    );
    return { id: r.insertId, nombre };
  });

  app.post('/:groupId/invite', { preHandler: app.auth }, async (req, reply) => {
    const { groupId } = req.params;
    const { userId } = req.body || {};
    await app.db.query(
      'INSERT IGNORE INTO usuarios_grupos (ID_Usuario, ID_Grupo, RolGrupo) VALUES (:u, :g, "Miembro")',
      { u: userId, g: groupId }
    );
    return { ok: true };
  });

  app.get('/', { preHandler: app.auth }, async (req) => {
    const [rows] = await app.db.query(
      `SELECT g.ID_Grupo as id, g.NombreGrupo, g.FechaCreacion
       FROM grupos g
       JOIN usuarios_grupos ug ON ug.ID_Grupo=g.ID_Grupo
       WHERE ug.ID_Usuario=:u`,
      { u: req.user.sub }
    );
    return rows;
  });
}
