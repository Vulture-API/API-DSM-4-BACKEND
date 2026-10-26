export type LimitViolation = "BELOW_MIN" | "ABOVE_MAX";

/**
 * Compara a leitura com a faixa configurada no sensor (SCRUM-424). Lado sem
 * limite (null) aceita qualquer valor; os limites são inclusivos.
 */
export function evaluateLimits(
  value: number,
  min: number | null,
  max: number | null,
): LimitViolation | null {
  if (min !== null && value < min) return "BELOW_MIN";
  if (max !== null && value > max) return "ABOVE_MAX";
  return null;
}
