export const MIN_COLLECTION_INTERVAL_SECONDS = 10;
export const DEFAULT_COLLECTION_INTERVAL_SECONDS = 60;

// Pelo menos duas coletas cabem na janela de "offline": uma leitura perdida
// não derruba o status da estação.
export function maxCollectionIntervalSeconds(
  offlineThresholdMinutes: number,
): number {
  return Math.floor((offlineThresholdMinutes * 60) / 2);
}

export function isValidCollectionInterval(
  seconds: number,
  offlineThresholdMinutes: number,
): boolean {
  return (
    Number.isInteger(seconds) &&
    seconds >= MIN_COLLECTION_INTERVAL_SECONDS &&
    seconds <= maxCollectionIntervalSeconds(offlineThresholdMinutes)
  );
}
