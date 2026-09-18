/** "1 minute", "30 minutes": the retention window as a phrase. */
export function minutesPhrase(minutes: number): string {
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
