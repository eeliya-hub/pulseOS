/**
 * The slice of a `/api/travel/destination` response a trip stores.
 *
 * Kept in one place because two paths produce it: picking a destination in the
 * trip editor, and back-filling a trip that came from the older single-trip
 * format, which knew the city name but not where it was.
 */
export function toDestination(found) {
  if (!found) return null;
  return {
    city: found.city,
    country: found.country,
    countryCode: found.countryCode,
    lat: found.lat,
    lon: found.lon,
    timeZone: found.timeZone,
    utcOffsetSeconds: found.utcOffsetSeconds,
    currency: found.currency,
    flag: found.flag,
    photo: found.photo,
    blurb: found.blurb,
    sockets: found.sockets,
    voltage: found.voltage,
    drivingSide: found.drivingSide,
    callingCode: found.callingCode,
    emergency: found.emergency,
  };
}
