import { ApplicationError } from "@/errors/application.error.js";

export class InvalidReportTypeError extends ApplicationError {
  constructor(type?: string) {
    const raw = (type || "").trim();
    const detail = raw
      ? `O tipo '${raw}' não é suportado.`
      : "Nenhum tipo de relatório foi informado.";

    super(
      400,
      "INVALID_REPORT_TYPE",
      `${detail} Os tipos permitidos são: 'historico' (ou 'history'), 'previsao' (ou 'forecast') e 'alertas' (ou 'alerts').`,
    );
  }
}
