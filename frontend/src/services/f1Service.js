import { api } from './api/backendClient.js';

// Formula 1 (Jolpica / Ergast — no key). Backend normalizes the nested MRData
// payloads; this exposes clean, component-facing methods.
export const f1Service = {
  async getUpcomingRaces() {
    try {
      return (await api.sports.f1.races('upcoming')).races ?? [];
    } catch {
      return [];
    }
  },
  async getRecentResults() {
    try {
      return await api.sports.f1.races('last'); // { race, results }
    } catch {
      return { race: null, results: [] };
    }
  },
  async getDriverStandings() {
    try {
      return (await api.sports.f1.standings('drivers')).standings ?? [];
    } catch {
      return [];
    }
  },
  async getConstructorStandings() {
    try {
      return (await api.sports.f1.standings('constructors')).standings ?? [];
    } catch {
      return [];
    }
  },
};
