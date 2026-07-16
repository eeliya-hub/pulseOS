import { waitForMock } from './mockLatency.js';

// Seed data for the finance view. The UI now reads/writes a local, user-editable
// copy of this via useFinanceStore (localStorage). Wire a real backend into
// getFinanceOverview later and hydrate the store from it.
export const financeDefaults = {
  currentBalance: 18420,
  netWorth: 42380,
  monthlyIncome: 4850,
  monthlyExpenses: 3180,
  accounts: [
    { id: 'acc-monzo', name: 'Monzo Current', type: 'Checking', balance: 6420 },
    { id: 'acc-marcus', name: 'Marcus Saver', type: 'Savings', balance: 9200 },
    { id: 'acc-t212', name: 'Trading 212 ISA', type: 'Investing', balance: 12640 },
    { id: 'acc-amex', name: 'Amex Gold', type: 'Credit', balance: -1840 },
  ],
  spendingTrend: [
    { label: 'Jul', value: 2980 },
    { label: 'Aug', value: 3240 },
    { label: 'Sep', value: 2760 },
    { label: 'Oct', value: 3020 },
    { label: 'Nov', value: 3390 },
    { label: 'Dec', value: 3860 },
    { label: 'Jan', value: 2650 },
    { label: 'Feb', value: 2860 },
    { label: 'Mar', value: 2440 },
    { label: 'Apr', value: 3310 },
    { label: 'May', value: 2980 },
    { label: 'Jun', value: 3180 },
  ],
  savingsGoals: [
    { id: 'goal-tokyo', name: 'Tokyo Fund', current: 3850, target: 5000, due: 'Aug 2026' },
    { id: 'goal-buffer', name: 'Emergency Buffer', current: 8200, target: 10000, due: 'Ongoing' },
    { id: 'goal-macbook', name: 'MacBook Upgrade', current: 1280, target: 2400, due: 'Nov 2026' },
  ],
  upcomingBills: [
    { id: 'bill-rent', name: 'Rent', due: '12 Jun', amount: 1250 },
    { id: 'bill-apple', name: 'Apple One', due: '15 Jun', amount: 32.95 },
    { id: 'bill-gym', name: 'Gym', due: '18 Jun', amount: 49 },
  ],
};

export async function getFinanceOverview() {
  await waitForMock(460);
  return financeDefaults;
}
