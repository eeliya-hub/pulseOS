import { api } from './api/backendClient.js';

// Football (Football-Data.org). The backend owns the API key + mapping (the API
// blocks browser CORS), so this module is a thin, typed-shape wrapper. Every
// method resolves to a normalized array and never throws — components can render
// the result directly.
export const footballService = {
  async getStandings(competition = 'PL') {
    try {
      return (await api.sports.football.standings(competition)).table ?? [];
    } catch {
      return [];
    }
  },
  async getUpcomingFixtures(competition = 'PL') {
    try {
      return (await api.sports.football.fixtures(competition, 'upcoming')).fixtures ?? [];
    } catch {
      return [];
    }
  },
  async getRecentResults(competition = 'PL') {
    try {
      return (await api.sports.football.fixtures(competition, 'results')).fixtures ?? [];
    } catch {
      return [];
    }
  },
};
