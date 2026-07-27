// Gemini Live prebuilt voices. `id` is Google's internal voice name (passed to the
// API); `label` is a friendly common name and `gender` is shown so you can tell a
// male voice from a female one at a glance. Without a pinned voice, Gemini's
// default varies between sessions — which is why it kept changing.
export const VOICES = [
  { id: 'Puck', label: 'Leo', gender: 'male', note: 'Upbeat' },
  { id: 'Charon', label: 'James', gender: 'male', note: 'Deep, calm' },
  { id: 'Orus', label: 'Noah', gender: 'male', note: 'Warm' },
  { id: 'Fenrir', label: 'Max', gender: 'male', note: 'Energetic' },
  { id: 'Zephyr', label: 'Aria', gender: 'female', note: 'Bright' },
  { id: 'Kore', label: 'Emma', gender: 'female', note: 'Clear, firm' },
  { id: 'Aoede', label: 'Mia', gender: 'female', note: 'Breezy' },
  { id: 'Leda', label: 'Lily', gender: 'female', note: 'Youthful' },
];

export const DEFAULT_VOICE = 'Puck';
