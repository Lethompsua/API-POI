import { z } from 'zod';
import bcrypt from 'bcryptjs';

const userCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6) 
});


export default async function (app) {



  // Cambiar estado (Conectado/Desconectado/Ocupado)
  app.post('/me/status', { preHandler: app.auth }, async (req, reply) => {
    const { estado } = req.body || {};
    const allowed = ['Conectado','Desconectado','Ocupado'];
    if (!allowed.includes(estado)) return reply.code(400).send({ error: 'estado inválido' });
    await app.db.query('UPDATE usuarios SET EstadoConexion=:estado WHERE ID_Usuario=:id',
      { estado, id: req.user.sub });
    return { ok: true };
  });

  // Buscar usuarios (para iniciar chat)
  app.get('/', { preHandler: app.auth }, async (req) => {
    const q = req.query.q ? `%${req.query.q}%` : '%';
    const [rows] = await app.db.query(
      'SELECT ID_Usuario as id, Nombre, Apellido, CorreoUsuario, FotoPerfil, EstadoConexion FROM usuarios WHERE Nombre LIKE :q OR Apellido LIKE :q OR CorreoUsuario LIKE :q',
      { q }
    );
    return rows;
  });


  // Crear usuario
  app.post('/', async (req, reply) => {
    try {
      // 1. Validar los datos de entrada con Zod
      const parsed = userCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Datos inválidos', issues: parsed.error.issues });
      }

      const { name, email, password } = parsed.data;

      // 2. Hashear la contraseña
      const hashedPassword = await bcrypt.hash(password, 10);

      // 3. Guardar en la BD
      // ⚠️ ¡Ajusta esto a tu BD! 
      // Si no usas Prisma (como en customers.js), usa tu método app.db.query
      // Asumo que tu tabla es 'usuarios' y las columnas son 'Nombre', 'CorreoUsuario', 'ClaveUsuario'
      const [result] = await app.db.query(
        'INSERT INTO usuarios (Nombre, CorreoUsuario, ClaveUsuario) VALUES (?, ?, ?)',
        [name, email, hashedPassword]
      );
      
      // 4. Enviar respuesta (nunca envíes la contraseña)
      // Obtenemos el ID del usuario insertado
      const insertedId = result.insertId; 
      
      return reply.code(201).send({ id: insertedId, name: name, email: email });

    } catch (error) {
      // Manejo de error (ej. email duplicado)
      if (error.code === 'ER_DUP_ENTRY') { // Código de MySQL para 'Duplicate entry'
        return reply.code(400).send({ error: 'El correo electrónico ya está registrado.' });
      }
      console.error(error); // Imprime el error en tu consola de Node
      return reply.code(500).send({ error: 'Error interno del servidor' });
    }
  });

}
