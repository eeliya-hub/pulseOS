import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';

// Local development entry point. (In Firebase Functions you would import
// createApp from ./app.js instead — see functions/index.js.)
const app = createApp();

app.listen(config.port, () => {
  logger.info(`Pulse OS API listening on http://localhost:${config.port} (${config.env})`);
  logger.info(`Integration status: http://localhost:${config.port}/api/status`);
});
