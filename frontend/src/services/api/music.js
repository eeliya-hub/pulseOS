import { waitForMock } from './mockLatency.js';

export async function getMusicState() {
  // TODO: Replace with actual fetch to Spotify or Apple Music APIs.
  await waitForMock(330);

  return {
    nowPlaying: {
      title: 'Midnight City',
      artist: 'M83',
      album: "Hurry Up, We're Dreaming",
      progress: 0.62,
      duration: '4:03',
      elapsed: '2:31',
      palette: 'from-cyan-300 via-purple-400 to-pink-400',
    },
    playlists: [
      { name: 'Deep Focus', tracks: 68, mood: 'Flow', gradient: 'from-cyan-300/28 to-blue-500/16' },
      { name: 'Late Night Code', tracks: 42, mood: 'Nocturnal', gradient: 'from-purple-300/28 to-pink-500/16' },
      { name: 'Morning Lift', tracks: 35, mood: 'Energy', gradient: 'from-emerald-300/28 to-cyan-500/16' },
      { name: 'Tokyo Streets', tracks: 57, mood: 'Travel', gradient: 'from-pink-300/28 to-amber-500/16' },
    ],
  };
}
