import { waitForMock } from './mockLatency.js';

export async function getHomeBrief() {
  // TODO: Replace with actual aggregation from calendar, finance, news, travel, and task APIs.
  await waitForMock(380);

  return {
    morningBrief: [
      { label: 'Schedule', value: '4 events', detail: 'First at 09:00' },
      { label: 'Finance', value: '+GBP 1.67k', detail: 'Projected monthly cashflow' },
      { label: 'News', value: '3 signals', detail: 'AI, GBP, crypto' },
      { label: 'Travel', value: 'Tokyo in 42 days', detail: 'Hotel check pending' },
    ],
    eveningPreview: [
      'Gym at 18:30',
      'Review HCI prototype notes',
      'Top up Tokyo fund if cashflow holds',
    ],
    launchpad: [
      { name: 'Calendar', shortcut: 'GCal' },
      { name: 'Finance Sheet', shortcut: 'Sheets' },
      { name: 'Notion HQ', shortcut: 'Docs' },
      { name: 'Spotify', shortcut: 'Music' },
      { name: 'Flights', shortcut: 'Trip' },
      { name: 'Focus Mode', shortcut: 'Do Not Disturb' },
    ],
  };
}
