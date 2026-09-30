import { launchService } from '../services/system/launch.service.js';
import { siteIconService } from '../services/system/siteIcon.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const launchController = {
  // POST /api/launch  { app?: "Spotify", url?: "https://open.spotify.com" }
  open: asyncHandler(async (req, res) => {
    const { app, url, browser } = req.body ?? {};
    res.json(await launchService.open({ app, url, browser }));
  }),

  // GET /api/launch/browsers → { browsers: [{ name }] }
  browsers: asyncHandler(async (_req, res) => {
    res.json(await launchService.listBrowsers());
  }),

  // GET /api/launch/site-icon?url=figma.com → { icons: [{url,size}], best }
  siteIcon: asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(await siteIconService.resolve(req.query.url));
  }),

  // GET /api/launch/site-icon/image?url=… — an icon's bytes, fetched server-side
  // so a site's hotlink policy can't leave a tile blank.
  siteIconImage: asyncHandler(async (req, res) => {
    const { buffer, type } = await siteIconService.image(req.query.url);
    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=604800, immutable');
    res.send(buffer);
  }),

  /**
   * POST /api/launch/icon-file — raw image bytes in, a PNG out.
   * For the formats a browser can't decode on its own, .icns above all.
   */
  convertIcon: asyncHandler(async (req, res) => {
    const png = await launchService.convertIcon(req.body);
    res.set('Content-Type', 'image/png');
    res.send(png);
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
