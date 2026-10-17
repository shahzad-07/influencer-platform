// The languages an influencer can pick. Keep this the same as LANGUAGES in
// server/src/modules/profiles/profile.model.ts, since the server rejects
// anything that is not on its list.
export const LANGUAGES = [
  "English",
  "Hindi",
  "Urdu",
  "Bengali",
  "Telugu",
  "Marathi",
  "Tamil",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Odia",
  "Punjabi",
  "Assamese",
] as const;

export type Language = (typeof LANGUAGES)[number];

// The most an influencer can pick (the server enforces this too)
export const MAX_LANGUAGES = 6;
