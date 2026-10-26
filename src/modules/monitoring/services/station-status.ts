import type { OverviewStatus } from "@/modules/monitoring/types/monitoring.type.js";

/**
 * Offline se a última comunicação passou do limite (ou nunca houve); senão
 * "Com alerta" se há alerta não reconhecido; senão Online. Mesmo limite do
 * GET /api/stations/:id/status.
 */
export function stationStatus(
  lastCommunicationAt: Date | null,
  activeAlerts: number,
  now: Date,
  offlineThresholdMinutes: number,
): OverviewStatus {
  const limitMs = offlineThresholdMinutes * 60_000;
  if (
    !lastCommunicationAt ||
    now.getTime() - lastCommunicationAt.getTime() > limitMs
  )
    return "Offline";
  return activeAlerts > 0 ? "Com alerta" : "Online";
}
