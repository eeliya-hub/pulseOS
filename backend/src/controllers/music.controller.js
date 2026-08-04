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

  // GET /api/music/analysis/:trackId → Spotify's beat/bar/section timeline
  analysis: asyncHandler(async (req, res) => {
    res.json(await musicService.audioAnalysis(req.params.trackId));
  }),

  // GET /api/music/features/:trackId → tempo, energy, valence, danceability…
  features: asyncHandler(async (req, res) => {
    res.json(await musicService.audioFeatures(req.params.trackId));
  }),

  // GET /api/music/lyrics?track=&artist=&album=&durationMs=
  lyrics: asyncHandler(async (req, res) => {
    const durationMs = Number(req.query.durationMs);
    res.json(
      await musicService.lyrics({
        track: req.query.track,
        artist: req.query.artist,
        album: req.query.album,
        durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
      }),
    );
  }),
};
