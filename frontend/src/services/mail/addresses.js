/**
 * Reading addresses out of a composer field.
 *
 * The backend validates them again before anything is sent — this is only so
 * the Send button can tell whether there is anyone to send to, and so the
 * footer can say how many.
 */
export function splitAddresses(value) {
  return String(value || '')
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const angled = part.match(/^(.*?)<([^>]+)>$/);
      if (angled) return { name: angled[1].trim().replace(/^"|"$/g, ''), email: angled[2].trim() };
      return { name: '', email: part };
    })
    .filter((person) => person.email);
}

/** Addresses back into a field, the way they were typed. */
export const joinAddresses = (people = []) =>
  people
    .filter((p) => p?.email)
    .map((p) => (p.name ? `${p.name} <${p.email}>` : p.email))
    .join(', ');
