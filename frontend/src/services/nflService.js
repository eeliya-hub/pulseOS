import { api } from './api/backendClient.js';

// NFL (balldontlie). Backend holds the key + mapping; this exposes clean,
// component-facing methods returning normalized arrays.
export const nflService = {
  async getUpcomingGames() {
    try {
      return (await api.sports.nfl.games('upcoming')).games ?? [];
    } catch {
      return [];
    }
  },
  async getRecentGames() {
    try {
      return (await api.sports.nfl.games('recent')).games ?? [];
    } catch {
      return [];
    }
  },
  async getStandings() {
    try {
      return await api.sports.nfl.standings();
    } catch {
      return [];
    }
  },
};
