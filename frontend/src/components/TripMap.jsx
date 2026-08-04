import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';

/**
 * The trip map: OpenStreetMap data on CARTO's dark basemap, so it reads as part
 * of the dashboard rather than a bright rectangle pasted into it. No API key,
 * no SDK beyond Leaflet itself.
 *
 * It draws whatever the trip knows about — the destination, the hotel, every
 * itinerary stop with coordinates, and the live flight (route arc plus the
 * aircraft at its current position, rotated to its heading) — then fits the view
 * around them.
 */
const TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIBUTION = '© OpenStreetMap · © CARTO';

// Fallbacks for pins that don't carry their own colour (the city, airports).
const PIN_COLORS = {
  destination: '#74f2ff',
  stay: '#f472b6',
  airport: '#94a3b8',
  flight: '#60a5fa',
  plan: '#7dd3fc',
};

/**
 * Glyphs drawn inside the pins, so a marker says what it is at a glance rather
 * than only what colour it is. Stroke paths at a 24x24 viewBox — the same
 * drawing style as the icons in the rest of the dashboard.
 */
const PIN_GLYPHS = {
  destination: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  stay: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  airport:
    '<path d="M3.5 19h17"/><path d="M10 6.5 8 4l1.6-.4 3 2.2 4.2-1.1a1.6 1.6 0 0 1 .9 3l-11 5.3-2.6-1.5.4-1.5 1.9.6L10 6.5Z"/>',
  flight:
    '<path d="M3.5 19h17"/><path d="M10 6.5 8 4l1.6-.4 3 2.2 4.2-1.1a1.6 1.6 0 0 1 .9 3l-11 5.3-2.6-1.5.4-1.5 1.9.6L10 6.5Z"/>',
  food: '<path d="M3 2v7a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V2"/><path d="M6 2v20"/><path d="M18 2a4 4 0 0 0-3 3.9V13h3v9"/>',
  sight:
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>',
  transport:
    '<path d="M4 17V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10"/><path d="M4 12h16"/><path d="M4 17h16"/><path d="M7 20v1"/><path d="M17 20v1"/>',
  plan: '<path d="m20 6-11 11-5-5"/>',
};

/**
 * A glowing marker: a coloured disc with the kind's glyph knocked out of it in
 * the card background's own navy, so the pin reads on a dark map.
 */
function pinIcon(kind, active, color = null) {
  const fill = color || PIN_COLORS[kind] || PIN_COLORS.plan;
  const size = active ? 26 : 21;
  const glyph = PIN_GLYPHS[kind];
  const inner = glyph
    ? `<svg viewBox="0 0 24 24" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}"
         fill="none" stroke="#0b1024" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`
    : `<span style="width:${Math.round(size * 0.3)}px;height:${Math.round(size * 0.3)}px;border-radius:999px;background:#0b1024;opacity:.75"></span>`;

  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="
      display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:999px;
      background:${fill};
      box-shadow:0 0 0 2px rgba(255,255,255,0.3), 0 0 14px ${fill}, 0 2px 8px rgba(0,0,0,0.55);
    ">${inner}</span>`,
  });
}

function planeIcon(heading = 0, { size = 22, color = '#eaf9ff', glow = 'rgba(116,242,255,0.85)' } = {}) {
  const box = size + 8;
  return L.divIcon({
    className: '',
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
    html: `<span style="
      display:grid;place-items:center;width:${box}px;height:${box}px;
      transform:rotate(${heading}deg);filter:drop-shadow(0 0 8px ${glow});
    ">
      <svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" aria-hidden="true">
        <path d="M12 2c.7 0 1.2.9 1.2 2v5.6l7.6 4.4v1.9l-7.6-2.3v4.6l2.4 1.7v1.5L12 20.4l-3.6.9v-1.5l2.4-1.7v-4.6L3.2 15.9V14l7.6-4.4V4c0-1.1.5-2 1.2-2z"/>
      </svg>
    </span>`,
  });
}

/**
 * Points along the great circle between two coordinates. A straight line on a
 * Mercator map is not the path an aircraft flies — London to Tokyo bows far
 * north of it — so the route is interpolated properly.
 */
function greatCircle(from, to, segments = 48) {
  const rad = Math.PI / 180;
  const [lat1, lon1, lat2, lon2] = [from.lat * rad, from.lon * rad, to.lat * rad, to.lon * rad];
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );
  if (!d) return [[from.lat, from.lon]];

  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const f = i / segments;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    points.push([Math.atan2(z, Math.hypot(x, y)) / rad, Math.atan2(y, x) / rad]);
  }
  return points;
}

/**
 * Compass bearing from one point to the next, in degrees. Used to sit the plane
 * marker along the route rather than at a fixed angle — on a great circle the
 * heading changes the whole way, so the icon has to follow the line it's on.
 */
function bearing([lat1, lon1], [lat2, lon2]) {
  const rad = Math.PI / 180;
  const dLon = (lon2 - lon1) * rad;
  const y = Math.sin(dLon) * Math.cos(lat2 * rad);
  const x =
    Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos(dLon);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

// Number(null) is 0, not NaN — so null coordinates (a trip migrated from an
// older version, a place with no location) have to be rejected explicitly
// before they reach Leaflet, which throws on a null LatLng.
const coord = (value) => (value === null || value === undefined || value === '' ? NaN : Number(value));
const valid = (p) => Boolean(p) && Number.isFinite(coord(p.lat)) && Number.isFinite(coord(p.lon));

export default function TripMap({
  points = [],
  flight = null,
  center = null,
  className = '',
  interactive = true,
  activeId = null,
  showRoute = true,
  showAirports = true,
  onSelect,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  // Everything that should be drawn, in one dependency-friendly value.
  const drawn = useMemo(
    () => ({ points: points.filter(valid), flight, center, showRoute, showAirports }),
    [points, flight, center, showRoute, showAirports],
  );

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return undefined;
    const map = L.map(hostRef.current, {
      zoomControl: false,
      attributionControl: true,
      dragging: interactive,
      scrollWheelZoom: false, // never hijack the page; the expanded map enables it
      doubleClickZoom: interactive,
      touchZoom: interactive,
      keyboard: interactive,
      worldCopyJump: true,
    });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19, subdomains: 'abcd' }).addTo(map);
    if (interactive) L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.setView([20, 0], 2);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [interactive]);

  // Redraw markers whenever the trip's geography changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const bounds = [];

    for (const point of drawn.points) {
      const latlng = [Number(point.lat), Number(point.lon)];
      const marker = L.marker(latlng, {
        icon: pinIcon(point.kind, point.id === activeId, point.color),
        title: point.label,
        riseOnHover: true,
      });
      if (point.label) {
        marker.bindTooltip(
          `<span style="font-weight:600">${escapeHtml(point.label)}</span>${
            point.sublabel ? `<br><span style="opacity:.65">${escapeHtml(point.sublabel)}</span>` : ''
          }`,
          { direction: 'top', offset: [0, -12], className: 'trip-map-tip' },
        );
      }
      if (selectRef.current) marker.on('click', () => selectRef.current(point));
      marker.addTo(layer);
      bounds.push(latlng);
    }

    const { origin, destination, live } = drawn.flight ?? {};
    if (valid(origin) && valid(destination) && (drawn.showRoute || drawn.showAirports)) {
      const path = greatCircle(origin, destination);
      if (drawn.showRoute) {
        L.polyline(path, { color: '#60a5fa', weight: 1.5, opacity: 0.55, dashArray: '5 7' }).addTo(layer);
      }

      if (drawn.showAirports) {
        for (const [airport, label, arriving] of [
          [origin, `${origin.iata ?? ''} · ${origin.name ?? ''}`, false],
          [destination, `${destination.iata ?? ''} · ${destination.name ?? ''}`, true],
        ]) {
          L.marker([airport.lat, airport.lon], { icon: pinIcon('airport', false) })
            .bindTooltip(escapeHtml(label.replace(/^ · | · $/, '')), {
              direction: 'top',
              offset: [0, -10],
              className: 'trip-map-tip',
            })
            .addTo(layer);

          // Airports on their own shouldn't pull the view back to span two
          // continents — only the arrival airport counts, so it sits among the
          // destination's other pins. With the route drawn, both belong.
          if (drawn.showRoute || arriving) bounds.push([airport.lat, airport.lon]);
        }
      }

      // A plane riding the middle of the route, turned to the heading at that
      // exact point so it lies along the arc rather than across it.
      const middle = Math.floor(path.length / 2);
      const from = path[middle];
      const to = path[Math.min(middle + 1, path.length - 1)];
      if (drawn.showRoute && from && to && !valid(live)) {
        L.marker(from, {
          icon: planeIcon(bearing(from, to), { size: 28, color: '#e8f1ff', glow: 'rgba(96,165,250,0.95)' }),
          interactive: false,
          zIndexOffset: 400,
        }).addTo(layer);
      }

      // The flown leg, drawn solid over the dashed plan.
      if (drawn.showRoute && valid(live)) {
        L.polyline(greatCircle(origin, live), { color: '#60a5fa', weight: 2.5, opacity: 0.9 }).addTo(layer);
      }
    }

    if (valid(live)) {
      L.marker([live.lat, live.lon], { icon: planeIcon(live.heading ?? 0), zIndexOffset: 500 })
        .bindTooltip(
          `${escapeHtml(live.callsign ?? 'In the air')}${
            live.altitude ? `<br><span style="opacity:.65">${live.altitude.toLocaleString()} ft</span>` : ''
          }`,
          { direction: 'top', offset: [0, -14], className: 'trip-map-tip' },
        )
        .addTo(layer);
      bounds.push([live.lat, live.lon]);
    }

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 12);
    } else if (valid(drawn.center)) {
      map.setView([drawn.center.lat, drawn.center.lon], 11);
    }
  }, [drawn, activeId]);

  // Leaflet measures its container on creation; the bento resizes it afterwards.
  useEffect(() => {
    const map = mapRef.current;
    const host = hostRef.current;
    if (!map || !host || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return <div ref={hostRef} className={`trip-map ${className}`} role="application" aria-label="Trip map" />;
}

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
