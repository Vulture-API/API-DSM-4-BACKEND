import { ApplicationError } from "@/errors/application.error.js";

export class InvalidReportPeriodError extends ApplicationError {
  constructor(message: string) {
    super(400, "INVALID_REPORT_PERIOD", message);
  }

  static invalidFormat(
    field: "from" | "to",
    rawValue: unknown,
  ): InvalidReportPeriodError {
    return new InvalidReportPeriodError(
      `O campo '${field}' com valor '${String(rawValue)}' possui formato de data inválido. Utilize o formato ISO 8601 (exemplo: '2026-11-01T00:00:00.000Z' ou '2026-11-01').`,
    );
  }

  static inverted(from: Date, to: Date): InvalidReportPeriodError {
    return new InvalidReportPeriodError(
      `O período informado é inválido: a data inicial (${from.toISOString().slice(0, 10)}) deve ser estritamente anterior à data final (${to.toISOString().slice(0, 10)}).`,
    );
  }

  static periodTooLong(
    days: number,
    maxDays: number,
  ): InvalidReportPeriodError {
    return new InvalidReportPeriodError(
      `O intervalo selecionado (${days} dias) ultrapassa o limite máximo permitido de ${maxDays} dias para geração de relatórios.`,
    );
  }
}
