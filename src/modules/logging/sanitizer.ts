/**
 * Lista de padrões de chaves sensíveis que nunca devem ser expostas em logs abertos.
 */
const SENSITIVE_KEY_PATTERNS = [
  /passw(or)?d/i,
  /senha/i,
  /secret/i,
  /token/i,
  /jwt/i,
  /bearer/i,
  /auth(orization)?/i,
  /cookie/i,
  /api[_-]?key/i,
  /credenti?al/i,
  /private[_-]?key/i,
  /cert(ificate)?/i,
  /(^|[_-])session([_-]?(id|token|secret|key))?$/i,
  /credit[_-]?card/i,
  /cvv/i,
];

const REDACTED = "[REDACTED]";

/**
 * Verifica se o nome de um campo é considerado sensível.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Sanitiza recursivamente valores, objetos e arrays, substituindo
 * dados sensíveis por '[REDACTED]'. Trata referências circulares de forma segura.
 */
export function sanitizeLogData<T = unknown>(data: T, seen = new WeakSet()): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  // Prevenção de loop infinito por referências circulares
  if (seen.has(data)) {
    return "[CIRCULAR]" as unknown as T;
  }
  seen.add(data);

  if (data instanceof Error) {
    const errorCopy: Record<string, unknown> = {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
    for (const [key, value] of Object.entries(data)) {
      if (isSensitiveKey(key)) {
        errorCopy[key] = REDACTED;
      } else {
        errorCopy[key] = sanitizeLogData(value, seen);
      }
    }
    return errorCopy as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
    } else {
      result[key] = sanitizeLogData(value, seen);
    }
  }

  return result as unknown as T;
}

/**
 * Sanitiza cabeçalhos HTTP, removendo ou mascarando tokens de autenticação e cookies.
 */
export function sanitizeHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!headers) return {};
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey === "authorization" ||
      lowerKey === "proxy-authorization" ||
      lowerKey === "cookie" ||
      lowerKey === "set-cookie" ||
      lowerKey === "x-api-key" ||
      isSensitiveKey(lowerKey)
    ) {
      sanitized[key] = REDACTED;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
