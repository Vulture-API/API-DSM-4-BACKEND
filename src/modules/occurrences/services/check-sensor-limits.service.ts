import type { SensorLimitRepository } from "@/modules/occurrences/repositories/occurrence.repository.js";
import { evaluateLimits } from "@/modules/occurrences/services/sensor-limits.js";
import type { LimitCheckResult } from "@/modules/occurrences/types/occurrence.type.js";

export type CheckSensorLimitsOptions = {
  batchSize?: number;
  clock?: () => Date;
};

/**
 * Valida as leituras novas contra os limites dos sensores (SCRUM-424). Valor
 * fora da faixa vira inconsistente (some de dados atuais, estatísticas e
 * séries) e abre uma ocorrência OUT_OF_RANGE para o sensor. O checkpoint só
 * avança depois do lote gravado; reprocessar é seguro porque marcar de novo é
 * idempotente e o índice único impede uma segunda ocorrência aberta.
 */
export class CheckSensorLimitsService {
  private readonly batchSize: number;
  private readonly clock: () => Date;

  constructor(
    private readonly repository: SensorLimitRepository,
    options: CheckSensorLimitsOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 500;
    this.clock = options.clock ?? (() => new Date());
  }

  async execute(): Promise<LimitCheckResult> {
    const lastId = await this.repository.getCheckpoint();
    const readings = await this.repository.findReadingsAfter(
      lastId,
      this.batchSize,
    );
    if (readings.length === 0)
      return { readings_checked: 0, out_of_range: 0, last_reading_id: lastId };

    let outOfRange = 0;
    for (const reading of readings) {
      // Já inconsistente na origem: não é dado tratado nem precisa de outra marca.
      if (!reading.data_consistent) continue;
      const violation = evaluateLimits(
        reading.value,
        reading.min_value,
        reading.max_value,
      );
      if (!violation) continue;
      outOfRange++;
      const limit =
        violation === "BELOW_MIN"
          ? `abaixo do mínimo ${reading.min_value}`
          : `acima do máximo ${reading.max_value}`;
      await this.repository.flagOutOfRange({
        station_id: reading.station_id,
        sensor_id: reading.sensor_id,
        reading_id: reading.reading_id,
        reading_unix_time: reading.unix_time,
        value: reading.value,
        description: `Sensor ${reading.sensor_identifier}: valor ${reading.value} ${limit} configurado.`,
        detected_at: this.clock(),
      });
    }

    const last = readings[readings.length - 1]!.reading_id;
    await this.repository.setCheckpoint(last);
    return {
      readings_checked: readings.length,
      out_of_range: outOfRange,
      last_reading_id: last,
    };
  }
}
