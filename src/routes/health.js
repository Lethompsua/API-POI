export default async function (app) {
  app.get('/', async () => ({ ok: true, ts: Date.now() }));
}
