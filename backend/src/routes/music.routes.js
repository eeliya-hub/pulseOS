import { Router } from 'express';
import { musicController } from '../controllers/music.controller.js';

export const musicRouter = Router();

// OAuth
musicRouter.get('/auth', musicController.auth);
musicRouter.get('/callback', musicController.callback);

// Web Playback SDK (in-tab player, Premium)
musicRouter.get('/token', musicController.token);
musicRouter.put('/transfer', musicController.transfer);
musicRouter.put('/play', musicController.play);

// Data
musicRouter.get('/now-playing', musicController.nowPlaying);
musicRouter.get('/playlists', musicController.playlists);
musicRouter.get('/recently-played', musicController.recentlyPlayed);
musicRouter.get('/search', musicController.search);
