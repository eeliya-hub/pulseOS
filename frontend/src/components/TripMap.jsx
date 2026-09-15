import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef } from 'react';

/**
 * The trip map: a night-navy vector map — dark water, lighter land, blue roads,
 * white labels on a black halo.
 *
 * Vector rather than raster because that palette is a *style*, and a raster tile
 * arrives already painted: you take the provider's colours or you filter the
 * whole image. OpenFreeMap serves OpenStreetMap vector tiles with no key and no
 * quota, so the style is ours (public/map-style.json) and the map costs nothing.
 *
 * It draws whatever the trip knows about — the destination, the hotel, every
 * itinerary stop with coordinates, and the live flight (route arc plus the
 * aircraft at its current position, rotated to its heading) — then fits the view
 * around them.
 */
const STYLE_URL = '/map-style.json';

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
 * the map's own navy, so the pin reads against the dark ground.
 */
function pinElement(kind, active, color = null) {
  const fill = color || PIN_COLORS[kind] || PIN_COLORS.plan;
  const size = active ? 26 : 21;
  const glyph = PIN_GLYPHS[kind];
  const inner = glyph
    ? `<svg viewBox="0 0 24 24" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}"
         fill="none" stroke="#0b1024" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`
    : `<span style="width:${Math.round(size * 0.3)}px;height:${Math.round(size * 0.3)}px;border-radius:999px;background:#0b1024;opacity:.75"></span>`;

  const el = document.createElement('span');
  el.style.cssText = `display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:999px;
    background:${fill};cursor:${kind === 'airport' ? 'default' : 'pointer'};
    box-shadow:0 0 0 2px rgba(255,255,255,0.3), 0 0 14px ${fill}, 0 2px 8px rgba(0,0,0,0.55);`;
  el.innerHTML = inner;
  return el;
}

/**
 * The aircraft, drawn nose-up. Which way it points is the marker's job, not the
 * element's: the map writes its own transform onto whatever element it is given
 * — including a rotateZ — so a CSS rotation set here is overwritten and the
 * plane ends up permanently pointing north.
 */
function planeElement({ size = 22, color = '#eaf9ff', glow = 'rgba(116,242,255,0.85)' } = {}) {
  const box = size + 8;
  const el = document.createElement('span');
  el.style.cssText = `display:grid;place-items:center;width:${box}px;height:${box}px;
    filter:drop-shadow(0 0 8px ${glow});pointer-events:none;`;
  el.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" aria-hidden="true">
      <path d="M12 2c.7 0 1.2.9 1.2 2v5.6l7.6 4.4v1.9l-7.6-2.3v4.6l2.4 1.7v1.5L12 20.4l-3.6.9v-1.5l2.4-1.7v-4.6L3.2 15.9V14l7.6-4.4V4c0-1.1.5-2 1.2-2z"/>
    </svg>`;
  return el;
}

/**
 * Points along the great circle between two coordinates. A straight line on a
 * Mercator map is not the path an aircraft flies — London to Tokyo bows far
 * north of it — so the route is interpolated properly.
 *
 * Longitudes are unwrapped as they go, so a route crossing the date line draws
 * as one arc instead of snapping back across the whole map.
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
  if (!d) return [[from.lon, from.lat]];

  const points = [];
  let previous = null;
  for (let i = 0; i <= segments; i += 1) {
    const f = i / segments;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    let lng = Math.atan2(y, x) / rad;
    if (previous !== null) {
      while (lng - previous > 180) lng -= 360;
      while (previous - lng > 180) lng += 360;
    }
    previous = lng;
    points.push([lng, Math.atan2(z, Math.hypot(x, y)) / rad]);
  }
  return points;
}

/**
 * Compass bearing from one point to the next, in degrees. Used to sit the plane
 * marker along the route rather than at a fixed angle — on a great circle the
 * heading changes the whole way, so the icon has to follow the line it's on.
 */
function bearing([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const dLon = (lon2 - lon1) * rad;
  const y = Math.sin(dLon) * Math.cos(lat2 * rad);
  const x =
    Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos(dLon);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

// Number(null) is 0, not NaN — so null coordinates (a trip migrated from an
// older version, a place with no location) have to be rejected explicitly
// before they reach the map, which throws on a bad coordinate.
const coord = (value) => (value === null || value === undefined || value === '' ? NaN : Number(value));
const valid = (p) => Boolean(p) && Number.isFinite(coord(p.lat)) && Number.isFinite(coord(p.lon));

const ROUTE_SOURCE = 'trip-route';
const FLOWN_SOURCE = 'trip-flown';

const lineFeature = (coords) => ({
  type: 'FeatureCollection',
  features: coords.length ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }] : [],
});

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
  const readyRef = useRef(false);
  const markersRef = useRef([]);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  // Everything that should be drawn, in one dependency-friendly value.
  const drawn = useMemo(
    () => ({ points: points.filter(valid), flight, center, showRoute, showAirports }),
    [points, flight, center, showRoute, showAirports],
  );

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return undefined;
    const map = new MapLibreMap({
      container: hostRef.current,
      style: STYLE_URL,
      center: [0, 20],
      zoom: 1.1,
      attributionControl: { compact: true },
      interactive,
      dragRotate: false,
      pitchWithRotate: false,
      // Never hijack the page; the expanded map turns scroll zoom on.
      scrollZoom: false,
      doubleClickZoom: interactive,
      touchZoomRotate: interactive,
      keyboard: interactive,
    });
    map.touchZoomRotate?.disableRotation();
    if (interactive) map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      // The planned route and the leg already flown, as their own sources so a
      // redraw is a data swap rather than a teardown.
      for (const [id, colour, dash] of [
        [ROUTE_SOURCE, '#60a5fa', [1.6, 2.4]],
        [FLOWN_SOURCE, '#60a5fa', null],
      ]) {
        map.addSource(id, { type: 'geojson', data: lineFeature([]) });
        map.addLayer({
          id: `${id}-line`,
          type: 'line',
          source: id,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': colour,
            'line-width': dash ? 1.6 : 2.5,
            'line-opacity': dash ? 0.75 : 0.95,
            ...(dash ? { 'line-dasharray': dash } : {}),
          },
        });
      }
      readyRef.current = true;
      map.fire('pulse:ready');
    });

    mapRef.current = map;
    return () => {
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [interactive]);

  // Redraw markers and the route whenever the trip's geography changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const draw = () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];

      const bounds = new LngLatBounds();
      let count = 0;
      const add = (lngLat, element, tooltip, rotation = 0) => {
        const marker = new Marker({ element, rotation }).setLngLat(lngLat).addTo(map);
        if (tooltip) {
          marker.setPopup(
            new Popup({ offset: 14, closeButton: false, className: 'trip-map-tip' }).setHTML(tooltip),
          );
          element.addEventListener('mouseenter', () => marker.togglePopup());
          element.addEventListener('mouseleave', () => marker.getPopup()?.remove());
        }
        markersRef.current.push(marker);
        bounds.extend(lngLat);
        count += 1;
      };

      for (const point of drawn.points) {
        const element = pinElement(point.kind, point.id === activeId, point.color);
        if (selectRef.current) element.addEventListener('click', () => selectRef.current(point));
        add(
          [Number(point.lon), Number(point.lat)],
          element,
          point.label
            ? `<span style="font-weight:600">${escapeHtml(point.label)}</span>${
                point.sublabel ? `<br><span style="opacity:.65">${escapeHtml(point.sublabel)}</span>` : ''
              }`
            : null,
        );
      }

      const { origin, destination, live } = drawn.flight ?? {};
      let route = [];
      let flown = [];

      if (valid(origin) && valid(destination) && (drawn.showRoute || drawn.showAirports)) {
        const path = greatCircle(origin, destination);
        if (drawn.showRoute) route = path;

        if (drawn.showAirports) {
          for (const [airport, label, arriving] of [
            [origin, `${origin.iata ?? ''} · ${origin.name ?? ''}`, false],
            [destination, `${destination.iata ?? ''} · ${destination.name ?? ''}`, true],
          ]) {
            add(
              [Number(airport.lon), Number(airport.lat)],
              pinElement('airport', false),
              escapeHtml(label.replace(/^ · | · $/, '')),
            );
            // Airports on their own shouldn't pull the view back to span two
            // continents — only the arrival airport counts, so it sits among the
            // destination's other pins. With the route drawn, both belong.
            if (!drawn.showRoute && !arriving) {
              bounds.setNorthEast(bounds.getNorthEast());
            }
          }
        }

        // A plane riding the middle of the route, turned to the heading at that
        // exact point so it lies along the arc rather than across it.
        const middle = Math.floor(path.length / 2);
        const from = path[middle];
        const to = path[Math.min(middle + 1, path.length - 1)];
        if (drawn.showRoute && from && to && !valid(live)) {
          add(from, planeElement({ size: 28, color: '#e8f1ff', glow: 'rgba(96,165,250,0.95)' }), null, bearing(from, to));
        }
        if (drawn.showRoute && valid(live)) flown = greatCircle(origin, live);
      }

      if (valid(live)) {
        add(
          [Number(live.lon), Number(live.lat)],
          planeElement(),
          `${escapeHtml(live.callsign ?? 'In the air')}${
            live.altitude ? `<br><span style="opacity:.65">${live.altitude.toLocaleString()} ft</span>` : ''
          }`,
          live.heading ?? 0,
        );
      }

      map.getSource(ROUTE_SOURCE)?.setData(lineFeature(route));
      map.getSource(FLOWN_SOURCE)?.setData(lineFeature(flown));

      if (count > 1) map.fitBounds(bounds, { padding: 40, maxZoom: 13, duration: 0 });
      else if (count === 1) map.jumpTo({ center: bounds.getCenter(), zoom: 11 });
      else if (valid(drawn.center)) map.jumpTo({ center: [Number(drawn.center.lon), Number(drawn.center.lat)], zoom: 10 });
    };

    if (readyRef.current) draw();
    else map.once('pulse:ready', draw);
    return undefined;
  }, [drawn, activeId]);

  // The map measures its container on creation; the bento resizes it afterwards.
  useEffect(() => {
    const map = mapRef.current;
    const host = hostRef.current;
    if (!map || !host || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return <div ref={hostRef} className={`trip-map ${className}`} role="application" aria-label="Trip map" />;
}

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
