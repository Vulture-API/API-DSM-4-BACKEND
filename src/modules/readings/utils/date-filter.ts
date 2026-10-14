export function isValidDateOnlyString(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidIsoDateTimeString(value: string): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/,
  );
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = match[6] !== undefined ? Number(match[6]) : 0;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return false;
  }
  const checkDate = new Date(Date.UTC(year, month - 1, day));
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    return false;
  }
  const hasTimezone = /(Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value);
  const normalized = hasTimezone ? value : `${value}Z`;
  const date = new Date(normalized);
  return !Number.isNaN(date.getTime());
}

export function isValidDateParameter(value: string): boolean {
  return isValidDateOnlyString(value) || isValidIsoDateTimeString(value);
}

export function parseStartDateToUnix(value: string): number {
  if (isValidDateOnlyString(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return Math.floor(Date.UTC(year!, month! - 1, day!, 0, 0, 0, 0) / 1000);
  }
  const hasTimezone = /(Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value);
  const normalized = hasTimezone ? value : `${value}Z`;
  return Math.floor(new Date(normalized).getTime() / 1000);
}

export function parseEndDateToUnix(value: string): number {
  if (isValidDateOnlyString(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return Math.floor(Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999) / 1000);
  }
  const hasTimezone = /(Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value);
  const normalized = hasTimezone ? value : `${value}Z`;
  return Math.floor(new Date(normalized).getTime() / 1000);
}

export function resolveTimeRange(filters: {
  start_unix_time?: number | undefined;
  end_unix_time?: number | undefined;
  start_date?: string | undefined;
  end_date?: string | undefined;
  initial_date?: string | undefined;
  final_date?: string | undefined;
}): {
  startUnixTime: number | undefined;
  endUnixTime: number | undefined;
} {
  const startDate = filters.start_date ?? filters.initial_date;
  const endDate = filters.end_date ?? filters.final_date;

  const startUnixTime =
    filters.start_unix_time ??
    (startDate && isValidDateParameter(startDate)
      ? parseStartDateToUnix(startDate)
      : undefined);

  const endUnixTime =
    filters.end_unix_time ??
    (endDate && isValidDateParameter(endDate)
      ? parseEndDateToUnix(endDate)
      : undefined);

  return { startUnixTime, endUnixTime };
}
