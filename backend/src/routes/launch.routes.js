import { Router } from 'express';
import { launchController } from '../controllers/launch.controller.js';

export const launchRouter = Router();

// POST /api/launch  — open a native app (or URL fallback) on the local machine.
launchRouter.post('/', launchController.open);
// GET /api/launch/apps  — installed applications
launchRouter.get('/apps', launchController.apps);
// GET /api/launch/icon?app=Name  — the app's own icon (PNG)
launchRouter.get('/icon', launchController.icon);
