import { createServer } from './server.js';

const PORT = Number(process.env.PORT) || 4000;

const { httpServer } = createServer();
httpServer.listen(PORT, () => {
  console.log(`[jam-deck] server listening on http://localhost:${PORT}`);
});
