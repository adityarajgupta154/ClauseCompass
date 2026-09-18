/** "1 minute", "30 minute": Hinglish does not add an s. */
export function minutesPhrase(minutes: number): string {
  return `${minutes} minute`;
}
