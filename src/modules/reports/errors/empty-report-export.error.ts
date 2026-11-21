import { ApplicationError } from "@/errors/application.error.js";
import type { ExportedReportFilters } from "@/modules/reports/types/report-export.type.js";

const REPORT_LABELS: Record<ExportedReportFilters["report_type"], string> = {
  history: "histórico",
  forecast: "previsões",
  alerts: "alertas",
};

/** Converte data ISO ('YYYY-MM-DD' ou timestamp ISO) para o padrão brasileiro 'DD/MM/YYYY'. */
function formatDatePtBr(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (match?.[1] && match[2] && match[3]) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const parsed = new Date(isoDate);
  if (!Number.isNaN(parsed.getTime())) {
    const day = String(parsed.getUTCDate()).padStart(2, "0");
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const year = String(parsed.getUTCFullYear());
    return `${day}/${month}/${year}`;
  }

  return isoDate;
}

/** Erro disparado quando o relatório não possui registros para exportar no período informado. */
export class EmptyReportExportError extends ApplicationError {
  constructor(filters: ExportedReportFilters) {
    const label = REPORT_LABELS[filters.report_type];
    const from = formatDatePtBr(filters.period.from);
    const to = formatDatePtBr(filters.period.to);
    const scopeParts: string[] = [];

    if (filters.station) {
      scopeParts.push(
        `estação '${filters.station.name}' (ID ${filters.station.id})`,
      );
    }
    if (filters.property) {
      scopeParts.push(
        `propriedade '${filters.property.name}' (ID ${filters.property.id})`,
      );
    }

    const scopeText =
      scopeParts.length > 0 ? ` para ${scopeParts.join(" e ")}` : "";

    super(
      422,
      "EMPTY_REPORT_FOR_EXPORT",
      `Não existem registros no relatório de ${label} no período de ${from} a ${to}${scopeText} para exportar.`,
    );
  }
}
