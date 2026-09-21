import { lyricsService } from './lyrics.service.js';
import { spotifyProvider } from './spotify.provider.js';
import { audioFeatures as reccobeatsFeatures } from './reccobeats.provider.js';

export const musicService = {
  // Lyrics come from LRCLIB, not Spotify — see lyrics.service.js.
  lyrics: (params) => lyricsService.lookup(params),

  getAuthUrl: () => ({ url: spotifyProvider.getAuthUrl() }),
  connect: (code, user) => spotifyProvider.handleCallback(code, user),
  token: (user) => spotifyProvider.token(user),
  transfer: (payload, user) => spotifyProvider.transfer(payload, user),
  play: (payload, user) => spotifyProvider.play(payload, user),
  nowPlaying: (user) => spotifyProvider.nowPlaying(user),
  // Spotify Connect: what can play, what is playing, and controlling it there.
  devices: (user) => spotifyProvider.devices(user),
  playerState: (user) => spotifyProvider.playerState(user),
  command: (action, options, user) => spotifyProvider.command(action, options, user),
  playlists: (user) => spotifyProvider.playlists(user),
  recentlyPlayed: (user) => spotifyProvider.recentlyPlayed(user),
  search: (query, user) => spotifyProvider.search(query, user),
  audioAnalysis: (trackId, user) => spotifyProvider.audioAnalysis(trackId, user),

  /**
   * Tempo, energy, valence and friends — from Spotify where it still answers,
   * and from ReccoBeats where it does not. Spotify has returned a flat 403 here
   * for apps in Development mode since November 2024, so in practice the
   * fallback is the one that answers; it is tried second anyway, so the moment
   * that access comes back the better source wins with no code change.
   */
  audioFeatures: async (trackId, user) => {
    const first = await spotifyProvider.audioFeatures(trackId, user);
    if (first?.available) return first;
    const second = await reccobeatsFeatures(trackId);
    if (second?.available) return second;
    // Report why both refused, so a silent visualiser is diagnosable.
    return { available: false, reason: `spotify: ${first?.reason ?? 'unavailable'}; reccobeats: ${second?.reason ?? 'unavailable'}` };
  },
};
