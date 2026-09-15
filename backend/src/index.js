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

/**
 * Keep the process alive through faults that would otherwise end it silently.
 *
 * Node terminates on an unhandled promise rejection, and there was nothing here
 * to catch one — so a single stray rejection anywhere in a request, a websocket
 * or a background refresh took the whole backend down, and the app simply
 * reported that it could not be reached. Logging it loudly and continuing is the
 * right trade for a personal dashboard: one broken integration should not stop
 * the other twelve.
 */
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection (server kept running):', reason?.stack ?? reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception (server kept running):', error?.stack ?? error);
});

// Not something to shrug off like a stray fault: a server that can't take its port
// serves nothing. Kept alive by the handler above, it sat there looking healthy in
// the process list while every request went elsewhere or nowhere.
server.on('error', (error) => {
  logger.error(`Pulse OS API could not start on port ${config.port}: ${error.message}`);
  process.exit(1);
});

server.listen(config.port, () => {
  logger.info(`Pulse OS API listening on http://localhost:${config.port} (${config.env})`);
  logger.info(`Integration status: http://localhost:${config.port}/api/status`);
});
