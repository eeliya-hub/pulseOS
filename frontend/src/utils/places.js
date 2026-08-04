import { api } from '../services/api/backendClient.js';

/**
 * The image URL for a place photo, whichever source it came from.
 *
 * OpenStreetMap and Wikipedia hand back a plain URL; Google Places hands back a
 * reference that has to be redeemed with the API key, so those go through the
 * backend proxy instead of straight to Google.
 */
export function placePhotoUrl(photo, width = 320) {
  if (!photo) return null;
  return photo.url ?? (photo.ref ? api.travel.photoUrl(photo.ref, width) : null);
}
