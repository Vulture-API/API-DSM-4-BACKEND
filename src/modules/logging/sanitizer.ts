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
 * Chaves protegidas contra ataques de prototype pollution e property injection (CWE-250 / CWE-400).
 */
const FORBIDDEN_PROTOTYPE_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_PROTOTYPE_KEYS.has(key);
}

/**
 * Verifica se o nome de um campo é considerado sensível.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Sanitiza recursivamente valores, objetos e arrays, substituindo
 * dados sensíveis por '[REDACTED]'. Trata referências circulares e
 * previne remote property injection / prototype pollution.
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
    const errorEntries = Object.entries(data)
      .filter(([key]) => !isForbiddenKey(key))
      .map(([key, value]) => [
        key,
        isSensitiveKey(key) ? REDACTED : sanitizeLogData(value, seen),
      ]);

    return {
      name: data.name,
      message: data.message,
      stack: data.stack,
      ...Object.fromEntries(errorEntries),
    } as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, seen)) as unknown as T;
  }

  const sanitizedEntries = Object.entries(data)
    .filter(([key]) => !isForbiddenKey(key))
    .map(([key, value]) => [
      key,
      isSensitiveKey(key) ? REDACTED : sanitizeLogData(value, seen),
    ]);

  return Object.fromEntries(sanitizedEntries) as unknown as T;
}

/**
 * Sanitiza cabeçalhos HTTP, removendo ou mascarando tokens de autenticação e cookies.
 */
export function sanitizeHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!headers) return {};

  const entries = Object.entries(headers)
    .filter(([key]) => !isForbiddenKey(key))
    .map(([key, value]) => {
      const lowerKey = key.toLowerCase();
      const isRedacted =
        lowerKey === "authorization" ||
        lowerKey === "proxy-authorization" ||
        lowerKey === "cookie" ||
        lowerKey === "set-cookie" ||
        lowerKey === "x-api-key" ||
        isSensitiveKey(lowerKey);

      return [key, isRedacted ? REDACTED : value];
    });

  return Object.fromEntries(entries);
}
