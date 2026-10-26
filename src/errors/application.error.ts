/** Erro compartilhado; os handlers dos módulos preservam seus contratos HTTP. */
export class ApplicationError extends Error {
  public statusCode: number;
  public code: string | number;
  public details: string[];

  constructor(statusCode: number, message: string, details?: string[]);
  constructor(statusCode: number, code: string, message: string);
  constructor(
    statusCode: number,
    messageOrCode: string,
    messageOrDetails: string | string[] = [],
  ) {
    const coded = typeof messageOrDetails === "string";
    super(coded ? messageOrDetails : messageOrCode);
    this.statusCode = statusCode;
    this.code = coded ? messageOrCode : statusCode;
    this.details = coded ? [] : messageOrDetails;
    this.name = "ApplicationError";
  }
}
