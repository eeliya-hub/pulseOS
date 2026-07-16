import { waitForMock } from './mockLatency.js';

const fallbackResponses = [
  'I checked your command center. The highest leverage move is to protect the 14:00 focus block and clear the finance review before lunch.',
  'Your day looks balanced. I would batch messages after the seminar and keep the Tokyo booking task to a single 20-minute decision window.',
  'You are tracking ahead this month. Food and shopping are close to budget, but cashflow still leaves room for the Tokyo fund top-up.',
];

export async function sendPulseMessage(message, context = {}) {
  // TODO: Replace with actual fetch to Gemini API or your server-side AI gateway.
  await waitForMock(720);

  const normalized = message.toLowerCase();

  if (normalized.includes('market') || normalized.includes('stock')) {
    return {
      role: 'assistant',
      content:
        'Market read: AI semis are the strongest pocket, BTC is firm but not euphoric, and sterling strength could pressure US holdings slightly. I would review exposure, not chase.',
    };
  }

  if (normalized.includes('travel') || normalized.includes('tokyo')) {
    return {
      role: 'assistant',
      content:
        'Tokyo plan: confirm hotel cancellation terms, book the Shinkansen window after arrival, and keep Shibuya Sky flexible because visibility matters more than timing.',
    };
  }

  if (normalized.includes('finance') || normalized.includes('budget')) {
    return {
      role: 'assistant',
      content:
        'Finance brief: current cashflow is positive, savings goals are healthy, and subscriptions are under control. The only watch item is shopping at 93% of budget.',
    };
  }

  return {
    role: 'assistant',
    content:
      fallbackResponses[
        Math.abs((message.length + (context.activeView?.length ?? 0)) % fallbackResponses.length)
      ],
  };
}
