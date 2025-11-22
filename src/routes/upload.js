import { v2 as cloudinary } from 'cloudinary';

export default async function (app) {
  
  // Configuración automática usando la variable de entorno CLOUDINARY_URL
  // (No necesitas escribir config manual si la variable existe)

  app.post('/', { preHandler: app.auth }, async (req, reply) => {
    const data = await req.file();
    
    if (!data) {
      return reply.code(400).send({ error: 'No se envió ningún archivo' });
    }

    // Subir a Cloudinary usando un "Stream"
    try {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'fifa-app', resource_type: 'auto' }, // 'auto' detecta si es img, video o pdf
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        data.file.pipe(uploadStream);
      });

      // Devuelve la URL segura
      return { url: result.secure_url, type: result.resource_type, format: result.format };

    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Error al subir a Cloudinary' });
    }
  });
}