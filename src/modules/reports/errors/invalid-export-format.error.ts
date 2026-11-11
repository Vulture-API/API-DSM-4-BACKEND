import { ApplicationError } from "@/errors/application.error.js";

/** Erro disparado quando o formato de exportação solicitado não é suportado. */
export class InvalidExportFormatError extends ApplicationError {
  constructor(format?: string) {
    const raw = typeof format === "string" ? format.trim() : "";
    const detail = raw
      ? `O formato de exportação '${raw}' não é suportado.`
      : "Nenhum formato de exportação foi informado.";

    super(
      400,
      "INVALID_EXPORT_FORMAT",
      `${detail} Os formatos permitidos são: 'csv' e 'json'.`,
    );
  }
}
