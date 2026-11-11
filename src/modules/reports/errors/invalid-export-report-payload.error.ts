import { ApplicationError } from "@/errors/application.error.js";

/** Erro disparado quando o relatório fornecido para exportação é nulo ou malformado. */
export class InvalidExportReportPayloadError extends ApplicationError {
  constructor(reason: string) {
    super(
      400,
      "INVALID_EXPORT_REPORT",
      `O relatório informado para exportação é inválido: ${reason}`,
    );
  }
}
