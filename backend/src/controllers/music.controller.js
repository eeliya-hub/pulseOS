import { musicService } from '../services/music/music.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const musicController = {
  auth: asyncHandler(async (_req, res) => {
    res.json(musicService.getAuthUrl());
  }),

  callback: asyncHandler(async (req, res) => {
    await musicService.connect(req.query.code);
    res.send('Spotify connected. You can close this window.');
  }),

  // GET /api/music/token → { accessToken, expiresAt }  (for the Web Playback SDK)
  token: asyncHandler(async (_req, res) => {
    res.json(await musicService.token());
  }),

  // PUT /api/music/transfer { deviceId, play }
  transfer: asyncHandler(async (req, res) => {
    res.json(await musicService.transfer(req.body ?? {}));
  }),

  // PUT /api/music/play { deviceId, contextUri?, uris? }
  play: asyncHandler(async (req, res) => {
    res.json(await musicService.play(req.body ?? {}));
  }),

  nowPlaying: asyncHandler(async (_req, res) => {
    res.json(await musicService.nowPlaying());
  }),

  playlists: asyncHandler(async (_req, res) => {
    res.json({ playlists: await musicService.playlists() });
  }),

  recentlyPlayed: asyncHandler(async (_req, res) => {
    res.json({ tracks: await musicService.recentlyPlayed() });
  }),

  // GET /api/music/search?q=...
  search: asyncHandler(async (req, res) => {
    res.json({ tracks: await musicService.search(req.query.q) });
  }),
};
