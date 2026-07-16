import { waitForMock } from './mockLatency.js';

export async function getMarketSnapshot() {
  // TODO: Replace with actual fetch to AlphaVantage, Finnhub, Polygon, or your broker API for market data.
  await waitForMock(420);

  return {
    updatedAt: '09:42 London',
    sentiment: 'Risk-on, selective tech strength',
    summary:
      'Constructive tone into the London afternoon. AI-linked semis (NVDA +3.1%) keep leading, crypto breadth is improving with BTC firm above 68k, and sterling strength is a mild drag on US holdings. Nothing euphoric — position sizing stays moderate ahead of the next macro print.',
    watchlist: [
      { symbol: 'AAPL', name: 'Apple', price: 214.82, change: 0.018, sector: 'Mega-cap tech' },
      { symbol: 'NVDA', name: 'NVIDIA', price: 141.2, change: 0.031, sector: 'AI semis' },
      { symbol: 'TSLA', name: 'Tesla', price: 196.44, change: -0.012, sector: 'EV' },
      { symbol: 'BTC', name: 'Bitcoin', price: 68320, change: 0.024, sector: 'Crypto' },
      { symbol: 'ETH', name: 'Ethereum', price: 3650, change: 0.009, sector: 'Crypto' },
      { symbol: 'VUSA', name: 'S&P 500 ETF', price: 88.74, change: 0.006, sector: 'Core ETF' },
    ],
    news: [
      {
        id: 'n1',
        category: 'Markets',
        title: 'AI infrastructure spend keeps lifting semiconductor guidance',
        blurb: 'Hyperscaler capex guidance was revised higher again, with memory and networking names catching the follow-through bid.',
        source: 'Pulse Markets',
        time: '18 min ago',
      },
      {
        id: 'n2',
        category: 'Macro',
        title: 'Sterling firms as traders reassess the summer rate path',
        blurb: 'Gilt yields ticked up after services inflation came in sticky, pushing back expectations for the next BoE cut.',
        source: 'Macro Desk',
        time: '41 min ago',
      },
      {
        id: 'n3',
        category: 'Crypto',
        title: 'Crypto liquidity improves after weekend consolidation',
        blurb: 'BTC held the 68k shelf while ETH outperformed; perp funding normalised across the majors.',
        source: 'Chain Signal',
        time: '1 hr ago',
      },
      {
        id: 'n4',
        category: 'Tech',
        title: 'Cloud majors signal another leg of data-centre buildout',
        blurb: 'Three of the largest operators flagged multi-year commitments, keeping power and cooling suppliers in focus.',
        source: 'Pulse Tech',
        time: '2 hr ago',
      },
      {
        id: 'n5',
        category: 'Energy',
        title: 'Brent steadies as OPEC+ holds output policy unchanged',
        blurb: 'Crude drifted in a tight range; refiners eased on softer crack spreads into the driving season.',
        source: 'Commodities Wire',
        time: '3 hr ago',
      },
      {
        id: 'n6',
        category: 'UK',
        title: 'FTSE 100 nudges record as miners and banks lead',
        blurb: 'A weaker open in the pound flattered overseas earners; defensives lagged the risk-on tape.',
        source: 'London Close',
        time: '4 hr ago',
      },
      {
        id: 'n7',
        category: 'Rates',
        title: 'Fed minutes leave the door open but in no hurry',
        blurb: 'Officials want more evidence disinflation is durable before committing to the next move, per the record.',
        source: 'Macro Desk',
        time: '5 hr ago',
      },
      {
        id: 'n8',
        category: 'World',
        title: 'Yen weakness back in focus as intervention talk builds',
        blurb: 'USD/JPY pressed toward multi-decade highs, reviving jawboning from officials in Tokyo.',
        source: 'FX Signal',
        time: '6 hr ago',
      },
    ],
    sports: [
      {
        id: 'arsenal',
        label: 'Arsenal',
        comp: 'Premier League',
        fixture: {
          badge: 'Premier League',
          title: 'Arsenal vs Chelsea',
          subtitle: 'Emirates Stadium · London derby',
          date: 'Sat 12 Jul',
          time: '17:30',
        },
        standingsHead: ['P', 'GD', 'Pts'],
        standings: [
          { pos: 1, name: 'Man City', vals: ['38', '+62', '89'] },
          { pos: 2, name: 'Arsenal', vals: ['38', '+48', '84'], me: true },
          { pos: 3, name: 'Liverpool', vals: ['38', '+45', '82'] },
          { pos: 4, name: 'Aston Villa', vals: ['38', '+19', '68'] },
          { pos: 5, name: 'Tottenham', vals: ['38', '+12', '66'] },
        ],
      },
      {
        id: 'f1',
        label: 'F1',
        comp: 'Formula 1',
        fixture: {
          badge: 'Round 12',
          title: 'British Grand Prix',
          subtitle: 'Silverstone Circuit · 52 laps',
          date: 'Sun 13 Jul',
          time: '15:00',
        },
        standingsHead: ['Wins', 'Pts'],
        standings: [
          { pos: 1, name: 'Verstappen', vals: ['7', '210'], me: true },
          { pos: 2, name: 'Norris', vals: ['3', '185'] },
          { pos: 3, name: 'Leclerc', vals: ['2', '160'] },
          { pos: 4, name: 'Piastri', vals: ['1', '145'] },
          { pos: 5, name: 'Hamilton', vals: ['1', '140'] },
        ],
      },
      {
        id: 'jaguars',
        label: 'Jaguars',
        comp: 'NFL · AFC South',
        fixture: {
          badge: 'NFL Week 1',
          title: 'Jaguars @ Titans',
          subtitle: 'Nissan Stadium · Nashville',
          date: 'Sun 07 Sep',
          time: '18:00',
        },
        standingsHead: ['W', 'L', 'Pct'],
        standings: [
          { pos: 1, name: 'Texans', vals: ['11', '6', '.647'] },
          { pos: 2, name: 'Colts', vals: ['9', '8', '.529'] },
          { pos: 3, name: 'Jaguars', vals: ['8', '9', '.471'], me: true },
          { pos: 4, name: 'Titans', vals: ['5', '12', '.294'] },
        ],
      },
      {
        id: 'england',
        label: 'England',
        comp: 'Euro Qualifying',
        fixture: {
          badge: 'Group C',
          title: 'England vs Serbia',
          subtitle: 'Wembley Stadium · Qualifier',
          date: 'Fri 05 Sep',
          time: '19:45',
        },
        standingsHead: ['P', 'GD', 'Pts'],
        standings: [
          { pos: 1, name: 'England', vals: ['8', '+16', '22'], me: true },
          { pos: 2, name: 'Serbia', vals: ['8', '+6', '15'] },
          { pos: 3, name: 'Hungary', vals: ['8', '+2', '13'] },
          { pos: 4, name: 'Albania', vals: ['8', '-7', '7'] },
          { pos: 5, name: 'Andorra', vals: ['8', '-17', '2'] },
        ],
      },
      {
        id: 'lakers',
        label: 'Lakers',
        comp: 'NBA · West',
        fixture: {
          badge: 'NBA Season',
          title: 'Lakers vs Warriors',
          subtitle: 'Crypto.com Arena · LA',
          date: 'Wed 22 Oct',
          time: '22:30',
        },
        standingsHead: ['W', 'L', 'Pct'],
        standings: [
          { pos: 1, name: 'Thunder', vals: ['68', '14', '.829'] },
          { pos: 2, name: 'Nuggets', vals: ['57', '25', '.695'] },
          { pos: 3, name: 'Timberwolves', vals: ['53', '29', '.646'] },
          { pos: 4, name: 'Lakers', vals: ['50', '32', '.610'], me: true },
          { pos: 5, name: 'Clippers', vals: ['48', '34', '.585'] },
        ],
      },
    ],
  };
}

export async function summarizeMarket() {
  // TODO: Replace with actual call to your preferred AI summarization endpoint.
  await waitForMock(760);

  return 'Markets are leaning constructive: AI-linked equities are leading, crypto breadth is improving, and FX risk is muted. Keep position sizing moderate around upcoming macro prints.';
}
