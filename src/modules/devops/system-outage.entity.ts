import { z } from "zod";

export const outageSeveritySchema = z.enum(["CRITICAL", "HIGH", "WARNING"]);
export type OutageSeverity = z.infer<typeof outageSeveritySchema>;

export const outageStatusSchema = z.enum(["OPEN", "RESOLVED"]);
export type OutageStatus = z.infer<typeof outageStatusSchema>;

export const failureDetailsSchema = z
  .object({
    error: z.string().optional(),
    rootCause: z.string().optional(),
    impactedEndpoints: z.array(z.string()).optional(),
    httpStatus: z.number().optional(),
    diagnosticData: z.record(z.string(), z.unknown()).optional(),
    resolutionNotes: z.string().optional(),
    detectionSource: z
      .enum(["HEALTH_CHECK", "METRICS_ALERT", "PROBE", "MANUAL"])
      .optional(),
  })
  .passthrough();

export type FailureDetails = z.infer<typeof failureDetailsSchema>;

export const systemOutageSchema = z.object({
  id: z.string(),
  service: z.string(),
  severity: outageSeveritySchema,
  status: outageStatusSchema,
  startTime: z.string().datetime(),
  endTime: z.string().datetime().nullable(),
  durationSeconds: z.number().nullable(),
  reason: z.string(),
  failureDetails: failureDetailsSchema.default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SystemOutage = z.infer<typeof systemOutageSchema>;

export const createOutageSchema = z.object({
  service: z.string().min(1, "O serviço afetado é obrigatório"),
  severity: outageSeveritySchema.optional().default("CRITICAL"),
  reason: z.string().min(1, "O motivo da indisponibilidade é obrigatório"),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().nullable().optional(),
  failureDetails: failureDetailsSchema.optional(),
});

export type CreateOutageDTO = {
  service: string;
  severity?: OutageSeverity | undefined;
  reason: string;
  startTime?: string | undefined;
  endTime?: string | null | undefined;
  failureDetails?: FailureDetails | undefined;
};

export const resolveOutageSchema = z.object({
  endTime: z.string().datetime().optional(),
  resolutionNotes: z.string().optional(),
  rootCause: z.string().optional(),
});

export type ResolveOutageDTO = {
  endTime?: string | undefined;
  resolutionNotes?: string | undefined;
  rootCause?: string | undefined;
};

export const outageFilterSchema = z.object({
  service: z.string().optional(),
  status: outageStatusSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(500).optional().default(50),
});

export type OutageFilterDTO = {
  service?: string | undefined;
  status?: OutageStatus | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit?: number | undefined;
};

export const slaCalculationSchema = z.object({
  windowHours: z.coerce.number().positive().optional().default(720), // 30 dias por padrão
  slaTargetPercentage: z.coerce
    .number()
    .min(0)
    .max(100)
    .optional()
    .default(99.0),
});

export type SlaCalculationDTO = {
  windowHours?: number | undefined;
  slaTargetPercentage?: number | undefined;
};

export type SlaValidationResult = {
  evaluationWindowHours: number;
  evaluationWindowSeconds: number;
  totalTimeSeconds: number;
  downtimeSeconds: number;
  uptimeSeconds: number;
  availabilityPercentage: number;
  slaTargetPercentage: number;
  slaCompliant: boolean;
  slaGapPercentage: number;
  outagesCount: number;
  activeOutagesCount: number;
  mttrMinutes: number; // Mean Time To Recovery
  mttfHours: number; // Mean Time To Failure
  evaluatedFrom: string;
  evaluatedTo: string;
  outages: SystemOutage[];
};
