import { api } from './api/backendClient.js';

// NBA (balldontlie). Backend holds the key + mapping; this exposes clean,
// component-facing methods returning normalized arrays.
export const nbaService = {
  async getUpcomingGames() {
    try {
      return (await api.sports.nba.games('upcoming')).games ?? [];
    } catch {
      return [];
    }
  },
  async getRecentGames() {
    try {
      return (await api.sports.nba.games('recent')).games ?? [];
    } catch {
      return [];
    }
  },
  async getStandings() {
    try {
      return await api.sports.nba.standings();
    } catch {
      return [];
    }
  },
};
