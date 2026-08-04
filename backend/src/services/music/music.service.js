import { lyricsService } from './lyrics.service.js';
import { spotifyProvider } from './spotify.provider.js';

export const musicService = {
  // Lyrics come from LRCLIB, not Spotify — see lyrics.service.js.
  lyrics: (params) => lyricsService.lookup(params),

  getAuthUrl: () => ({ url: spotifyProvider.getAuthUrl() }),
  connect: (code, user) => spotifyProvider.handleCallback(code, user),
  token: (user) => spotifyProvider.token(user),
  transfer: (payload, user) => spotifyProvider.transfer(payload, user),
  play: (payload, user) => spotifyProvider.play(payload, user),
  nowPlaying: (user) => spotifyProvider.nowPlaying(user),
  playlists: (user) => spotifyProvider.playlists(user),
  recentlyPlayed: (user) => spotifyProvider.recentlyPlayed(user),
  search: (query, user) => spotifyProvider.search(query, user),
  audioAnalysis: (trackId, user) => spotifyProvider.audioAnalysis(trackId, user),
  audioFeatures: (trackId, user) => spotifyProvider.audioFeatures(trackId, user),
};
