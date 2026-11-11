import { InvalidExportReportPayloadError } from "@/modules/reports/errors/invalid-export-report-payload.error.js";
import type { GenerateReportService } from "@/modules/reports/services/generate-report.service.js";
import type { GenerateReportInput } from "@/modules/reports/types/report.type.js";
import type {
  ExportedReportResult,
  ExportReportInput,
} from "@/modules/reports/types/report-export.type.js";
import { exportReport } from "@/modules/reports/utils/report-export.rules.js";

export type GenerateAndExportInput = GenerateReportInput & {
  format: string;
  allowEmpty?: boolean | undefined;
};

export class ExportReportService {
  constructor(private readonly generateReportService?: GenerateReportService) {}

  exportFromReport(input: ExportReportInput): ExportedReportResult {
    return exportReport(input);
  }

  async generateAndExport(
    input: GenerateAndExportInput,
  ): Promise<ExportedReportResult> {
    if (!this.generateReportService) {
      throw new InvalidExportReportPayloadError(
        "serviço de geração de relatórios não configurado para geração automática.",
      );
    }

    const { format, allowEmpty, ...reportInput } = input;
    const report = await this.generateReportService.execute(reportInput);

    return exportReport({
      report,
      format,
      allowEmpty,
    });
  }
}
