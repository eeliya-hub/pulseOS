import { launchService } from '../services/system/launch.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const launchController = {
  // POST /api/launch  { app?: "Spotify", url?: "https://open.spotify.com" }
  open: asyncHandler(async (req, res) => {
    const { app, url } = req.body ?? {};
    res.json(await launchService.open({ app, url }));
  }),

  // GET /api/launch/apps → { apps: [{ name }] }
  apps: asyncHandler(async (_req, res) => {
    res.json(await launchService.listApps());
  }),

  // GET /api/launch/icon?app=Spotify → the app's own icon as a PNG
  icon: asyncHandler(async (req, res) => {
    const buffer = await launchService.appIcon(req.query.app);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=604800');
    res.send(buffer);
  }),
};
