import { waitForMock } from './mockLatency.js';

export async function getTravelPlan() {
  // TODO: Replace with actual fetch to flight, hotel, and itinerary APIs.
  await waitForMock(430);

  return {
    destination: 'Tokyo',
    dates: '20 Jul - 2 Aug',
    countdown: 42,
    flight: {
      outbound: 'BA007 LHR to HND',
      time: '20 Jul, 09:10',
      seat: '32A',
      status: 'On schedule',
    },
    hotel: {
      name: 'Trunk Hotel Yoyogi Park',
      checkIn: '20 Jul, 15:00',
      nights: 13,
      status: 'Refundable until 7 Jul',
    },
    bookingLinks: [
      { label: 'Flight details', href: '#' },
      { label: 'Hotel booking', href: '#' },
      { label: 'JR Pass', href: '#' },
    ],
    itinerary: [
      { day: 'Day 1', title: 'Arrive, Shibuya walk, ramen reset' },
      { day: 'Day 2', title: 'Harajuku, Omotesando, Meiji Shrine' },
      { day: 'Day 4', title: 'TeamLab Borderless and Roppongi dinner' },
      { day: 'Day 7', title: 'Shinkansen window for Kyoto day trip' },
      { day: 'Day 12', title: 'Shopping buffer and sunset at Shibuya Sky' },
    ],
  };
}
