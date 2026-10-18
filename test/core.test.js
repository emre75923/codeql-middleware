/**
 * @file Tests for the correlation-id middleware.
 *
 * Tests use only `node:test` and `node:assert/strict` as required.
 * All UUID generation is made deterministic by passing a fake `uuidFactory`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createCorrelationIdMiddleware,
  generateCorrelationId,
  extractIncomingId,
  CORRELATION_ID_HEADER,
} from "../src/core.js";

const FAKE_UUID = "11111111-2222-3333-4444-555555555555";
const fakeUuidFactory = () => FAKE_UUID;

test("generates a new correlation id when no header is present", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const result = mw({});
  assert.equal(result.correlationId, FAKE_UUID);
  assert.equal(result.responseHeaders[CORRELATION_ID_HEADER], FAKE_UUID);
});

test("generates a new correlation id when headers is undefined", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const result = mw(undefined);
  assert.equal(result.correlationId, FAKE_UUID);
});

test("reads an incoming correlation id header (lowercase key)", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const incoming = "abc-123";
  const result = mw({ "x-correlation-id": incoming });
  assert.equal(result.correlationId, incoming);
  assert.equal(result.responseHeaders[CORRELATION_ID_HEADER], incoming);
});

test("reads an incoming correlation id header (mixed-case key)", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const incoming = "abc-456";
  const result = mw({ "X-Correlation-ID": incoming });
  assert.equal(result.correlationId, incoming);
});

test("trims whitespace from an incoming correlation id", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const result = mw({ "x-correlation-id": "  spaced-id  " });
  assert.equal(result.correlationId, "spaced-id");
  assert.equal(result.responseHeaders[CORRELATION_ID_HEADER], "spaced-id");
});

test("treats a whitespace-only header value as missing and generates a new id", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const result = mw({ "x-correlation-id": "   " });
  assert.equal(result.correlationId, FAKE_UUID);
});

test("treats an empty-string header value as missing and generates a new id", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const result = mw({ "x-correlation-id": "" });
  assert.equal(result.correlationId, FAKE_UUID);
});

test("uses the first element when the header is an array", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const result = mw({ "x-correlation-id": ["first-id", "second-id"] });
  assert.equal(result.correlationId, "first-id");
});

test("falls back to a new id when the header array's first element is empty", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const result = mw({ "x-correlation-id": ["", "second-id"] });
  assert.equal(result.correlationId, FAKE_UUID);
});

test("attaches the correlation id to a copy of the existing context", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const existing = { userId: 42, trace: "abc" };
  const result = mw({}, existing);
  assert.equal(result.context.userId, 42);
  assert.equal(result.context.trace, "abc");
  assert.equal(result.context.correlationId, FAKE_UUID);
  // Verify the original context object is not mutated.
  assert.equal(existing.correlationId, undefined);
});

test("works with a Headers instance (Fetch-style) carrying the header", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const headers = new Headers({ "x-correlation-id": "from-fetch" });
  const result = mw(headers);
  assert.equal(result.correlationId, "from-fetch");
});

test("works with a Headers instance that does not carry the header", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const headers = new Headers({ "content-type": "application/json" });
  const result = mw(headers);
  assert.equal(result.correlationId, FAKE_UUID);
});

test("CORRELATION_ID_HEADER equals the canonical lowercased header name", () => {
  assert.equal(CORRELATION_ID_HEADER, "x-correlation-id");
});

test("extractIncomingId returns null for an undefined headers argument", () => {
  assert.equal(extractIncomingId(undefined), null);
});

test("generateCorrelationId delegates to the provided factory", () => {
  assert.equal(generateCorrelationId(fakeUuidFactory), FAKE_UUID);
});

test("createCorrelationIdMiddleware throws when uuidFactory is not a function", () => {
  assert.throws(
    () => createCorrelationIdMiddleware({ uuidFactory: "not-a-function" }),
    TypeError
  );
});

test("middleware throws when existingContext is not an object", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  assert.throws(() => mw({}, "not-an-object"), TypeError);
  assert.throws(() => mw({}, 123), TypeError);
});

test("middleware throws when existingContext is null", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  assert.throws(() => mw({}, null), TypeError);
});

test("middleware works with a plain Headers-style object using get()", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const fakeHeaders = {
    get(name) {
      return name === CORRELATION_ID_HEADER ? "duck-typed-id" : null;
    },
  };
  const result = mw(fakeHeaders);
  assert.equal(result.correlationId, "duck-typed-id");
});

test("middleware works with a plain Headers-style object returning null", () => {
  const mw = createCorrelationIdMiddleware({ uuidFactory: fakeUuidFactory });
  const fakeHeaders = {
    get() {
      return null;
    },
  };
  const result = mw(fakeHeaders);
  assert.equal(result.correlationId, FAKE_UUID);
});

test("default uuidFactory path produces a valid-looking UUID", () => {
  // This exercises the real generation path (randomUUID or the manual fallback)
  // and only asserts the format, so it is deterministic across machines.
  const id = generateCorrelationId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test("default middleware path produces a valid-looking UUID and echoes it", () => {
  const mw = createCorrelationIdMiddleware();
  const result = mw({});
  assert.match(
    result.correlationId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  );
  assert.equal(result.responseHeaders[CORRELATION_ID_HEADER], result.correlationId);
});
