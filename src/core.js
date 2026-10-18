/**
 * @file Core implementation of the correlation-id middleware.
 *
 * WHY a single HTTP framework-agnostic function: by returning a plain object
 * (context, headers) we let the caller adapt it to Express, Fastify, Fetch,
 * or any custom handler, without forcing a dependency on any of them.
 */

/**
 * The canonical header name used for reading and writing correlation IDs.
 * Lowercased so it matches the Node.js `http.IncomingHttpHeaders` convention,
 * which is always lowercased regardless of the original casing on the wire.
 */
export const CORRELATION_ID_HEADER = "x-correlation-id";

/**
 * Generates a v4 UUID using the crypto.randomUUID primitive when available.
 *
 * WHY a fallback to `crypto.randomUUID` is wrapped: in older or non-browser
 * runtimes that lack it, we fall back to `randomBytes` + manual formatting so
 * the middleware works without any third-party polyfill. Both paths use the
 * Web Crypto standard; the fallback is RFC 4122-compliant v4.
 *
 * @param {() => string} [uuidFactory] - Optional override for the UUID source.
 *   Pass a fake here in tests to make the test fully deterministic.
 * @returns {string} A lowercase UUID string.
 */
export function generateCorrelationId(uuidFactory) {
  if (uuidFactory) {
    return uuidFactory();
  }
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback: construct a v4 UUID from random bytes.
  const { randomFillSync } = require("node:crypto");
  const bytes = new Uint8Array(16);
  randomFillSync(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return (
    hex.slice(0, 8) + "-" +
    hex.slice(8, 12) + "-" +
    hex.slice(12, 16) + "-" +
    hex.slice(16, 20) + "-" +
    hex.slice(20)
  );
}

/**
 * Returns the correlation ID from an incoming headers object, or null if
 * none is present.
 *
 * Header keys are case-insensitive; `extractIncomingId` accepts either a
 * plain object (with any casing) or a `Headers` instance (per the Fetch
 * standard) and normalizes to the canonical lowercased header name.
 *
 * Empty/whitespace-only values are treated as missing so we don't propagate
 * a useless empty string downstream.
 *
 * @param {Record<string, string | string[] | undefined> | Headers} headers
 * @returns {string | null}
 */
export function extractIncomingId(headers) {
  if (headers && typeof headers.get === "function") {
    const value = headers.get(CORRELATION_ID_HEADER);
    if (value === null) return null;
    return value.trim() === "" ? null : value.trim();
  }
  if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== CORRELATION_ID_HEADER) continue;
      if (Array.isArray(value)) {
        const first = value[0];
        if (typeof first === "string" && first.trim() !== "") return first.trim();
        return null;
      }
      if (typeof value === "string" && value.trim() !== "") return value.trim();
      return null;
    }
  }
  return null;
}

/**
 * Creates a correlation-id middleware function.
 *
 * The returned function takes `(headers, existingContext)` and returns an object
 * `{ correlationId, context, responseHeaders }`.
 *
 * Behaviour:
 *   1. If an incoming correlation-id header exists and is non-empty, it is
 *      trimmed and reused.
 *   2. Otherwise, a new UUID is generated via the `uuidFactory` option
 *      (defaults to `crypto.randomUUID` with a manual fallback).
 *   3. The correlation ID is written into a shallow copy of `existingContext`
 *      under the `correlationId` key.
 *   4. A `responseHeaders` object is returned containing the canonical header
 *      set to the correlation ID, ready for the caller to attach to the response.
 *
 * @param {object} [options]
 * @param {() => string} [options.uuidFactory] - Deterministic override for tests.
 * @returns {(headers: Record<string, string | string[] | undefined> | Headers, existingContext?: object) => { correlationId: string, context: object, responseHeaders: Record<string, string> }}
 */
export function createCorrelationIdMiddleware(options = {}) {
  const uuidFactory = options.uuidFactory;
  if (uuidFactory !== undefined && typeof uuidFactory !== "function") {
    throw new TypeError("options.uuidFactory must be a function when provided");
  }

  return function correlationIdMiddleware(headers, existingContext = {}) {
    if (existingContext === null || typeof existingContext !== "object") {
      throw new TypeError("existingContext must be an object");
    }

    const incoming = extractIncomingId(headers);
    const correlationId = incoming !== null ? incoming : generateCorrelationId(uuidFactory);

    const context = { ...existingContext, correlationId };
    const responseHeaders = { [CORRELATION_ID_HEADER]: correlationId };

    return { correlationId, context, responseHeaders };
  };
}
