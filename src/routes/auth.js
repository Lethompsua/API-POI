import bcrypt from 'bcryptjs';

export default async function (app) {
  /**
   * POST /auth/login
   * body: { email, password }
   * Nota: tu tabla tiene passwords mixtos (algunos texto claro, otros bcrypt).
   * Se intenta bcrypt y si falla, compara plano (solo para tu dataset).
   */
  app.post('/login', async (req, reply) => {
    const { email, password } = req.body || {};
    const [rows] = await app.db.query(
      'SELECT ID_Usuario, Nombre, Apellido, CorreoUsuario, ClaveUsuario, Rol FROM usuarios WHERE CorreoUsuario = :email LIMIT 1',
      { email }
    );
    if (!rows.length) return reply.code(401).send({ error: 'Credenciales inválidas' });

    const u = rows[0];
    let ok = false;
    try { ok = await bcrypt.compare(password, u.ClaveUsuario); } catch { ok = false; }
    if (!ok) ok = (password === u.ClaveUsuario);

    if (!ok) return reply.code(401).send({ error: 'Credenciales inválidas' });

    const token = app.jwt.sign({ sub: u.ID_Usuario, email: u.CorreoUsuario, role: u.Rol }, { expiresIn: '7d' });
    // marcar conectado
    await app.db.query(
      "UPDATE usuarios SET EstadoConexion='Conectado', UltimaConexion=NOW() WHERE ID_Usuario=:id",
      { id: u.ID_Usuario }
    );
    return { token, user: { id: u.ID_Usuario, nombre: u.Nombre, apellido: u.Apellido, rol: u.Rol } };
  });

  app.post('/logout', { preHandler: app.auth }, async (req) => {
    await app.db.query(
      "UPDATE usuarios SET EstadoConexion='Desconectado', UltimaConexion=NOW() WHERE ID_Usuario=:id",
      { id: req.user.sub }
    );
    return { ok: true };
  });
}
