import express, { Router } from 'express';
import { launchController } from '../controllers/launch.controller.js';

export const launchRouter = Router();

// POST /api/launch  — open a native app (or URL fallback) on the local machine.
launchRouter.post('/', launchController.open);
// POST /api/launch/icon-file  — an uploaded .icns (or similar) rendered to PNG.
// Raw bytes rather than JSON: an icon is a file, and base64 through the JSON
// parser would cost a third more bandwidth to say the same thing.
launchRouter.post('/icon-file', express.raw({ type: 'application/octet-stream', limit: '8mb' }), launchController.convertIcon);
// GET /api/launch/apps  — installed applications
launchRouter.get('/apps', launchController.apps);
// GET /api/launch/icon?app=Name  — the app's own icon (PNG)
launchRouter.get('/icon', launchController.icon);
// GET /api/launch/browsers  — installed browsers a link can be opened in
launchRouter.get('/browsers', launchController.browsers);
// GET /api/launch/site-icon?url=  — the best icon a website publishes
launchRouter.get('/site-icon', launchController.siteIcon);
// GET /api/launch/site-icon/image?url=  — that icon's bytes, proxied
launchRouter.get('/site-icon/image', launchController.siteIconImage);
