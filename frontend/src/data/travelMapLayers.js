// What the trip map can draw, each in the colour its pins and lines are drawn
// in. Shared by the map's own filter and the Travel page of Settings.
export const MAP_LAYERS = [
  { key: 'places', label: 'Places', hint: 'Everywhere you’ve pinned to see or eat', color: '#a78bfa' },
  { key: 'stay', label: 'Stay', hint: 'Where you’re sleeping', color: '#f472b6' },
  { key: 'flight', label: 'Route', hint: 'The flight, drawn from airport to airport', color: '#60a5fa' },
  { key: 'airports', label: 'Airports', hint: 'Both ends of the journey', color: '#94a3b8' },
];
