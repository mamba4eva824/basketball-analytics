/**
 * Phonetic respellings for names the speech model mispronounces. Applied only to the text sent to
 * /api/tts — captions keep the real spelling. Matches with or without diacritics, and possessives.
 */
const RESPELLINGS: [name: RegExp, spoken: string][] = [
  // Luka Dončić — English pronunciation "DAAN-chuhch"; "Don-chich" is what the Phonon voice gets right
  [/(?<!\p{L})Don[cč]i[cć](?!\p{L})/giu, "Don-chich"],
];

export function forSpeech(text: string): string {
  return RESPELLINGS.reduce((s, [name, spoken]) => s.replace(name, spoken), text);
}
