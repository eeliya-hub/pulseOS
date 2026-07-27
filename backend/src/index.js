import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { attachVoiceGateway } from './realtime/voiceGateway.js';
import { logger } from './utils/logger.js';

// Local development entry point. (In Firebase Functions you would import
// createApp from ./app.js instead — see functions/index.js.) The WebSocket voice
// gateway shares this HTTP server, so it lives here rather than in createApp():
// it's tied to the listener and has no place in the Firebase request handler.
const app = createApp();
const server = createServer(app);
attachVoiceGateway(server);

server.listen(config.port, () => {
  logger.info(`Pulse OS API listening on http://localhost:${config.port} (${config.env})`);
  logger.info(`Integration status: http://localhost:${config.port}/api/status`);
});
