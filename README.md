# codeql-middleware

Reads an incoming correlation id header or generates a new UUID, attaches it to a per-request context object, and returns a response header so the caller can echo it back to the client.

```js
import { createCorrelationIdMiddleware, CORRELATION_ID_HEADER } from "codeql-middleware";

const mw = createCorrelationIdMiddleware();

// headers: any plain object (lowercased keys, per Node's http module) or a
// Headers instance (per the Fetch standard). existingContext is optional.
const { correlationId, context, responseHeaders } = mw({}, { userId: 42 });

// context now has { userId: 42, correlationId: "<id>" }.
// responseHeaders is { "x-correlation-id": "<id>" } — merge it into your
// outgoing response headers.
```

## Exports

- `createCorrelationIdMiddleware(options?)` — returns `(headers, existingContext?) => { correlationId, context, responseHeaders }`.
- `CORRELATION_ID_HEADER` — the canonical header name (`"x-correlation-id"`).
- `generateCorrelationId(uuidFactory?)` — exposed for testing and reuse.
- `extractIncomingId(headers)` — exposed for testing and reuse.

## Why this exists

Distributed systems need a single identifier that follows a request across service boundaries so logs and traces can be correlated. Most web frameworks ship a plugin for this, but pulling in an entire framework just to thread an ID through is overkill when the logic is genuinely small. This library does only that threading, framework-agnostically, and lets the caller adapt the returned objects to whatever handler shape they use.

The trade-off: by being framework-agnostic the library cannot automatically set headers on a response object — the caller must merge `responseHeaders` themselves. This keeps the surface tiny and dependency-free.

## Edge cases you will hit

- **Empty or whitespace-only incoming header values are treated as missing.** A new UUID is generated rather than propagating an empty string downstream, which would break log grep.
- **Array-valued headers** (Node emits these when a header is sent twice) use the first non-empty element.
- **Header lookup is case-insensitive.** The canonical name is lowercased (`x-correlation-id`); any casing on the incoming request is matched.
- **The context is copied, not mutated.** The original `existingContext` object is left untouched; the returned `context` is a shallow spread copy with `correlationId` added.

## Testing

```
node --test
```

All UUID generation in tests is made deterministic via the `uuidFactory` option; no test relies on wall-clock time or sleeps.
