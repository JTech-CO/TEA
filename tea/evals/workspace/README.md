# orders-service

Small in-memory orders API used for internal demos. Everything runs on the
Node standard library; there are no external dependencies.

## Run

    npm start

## Test

    npm test

## Layout

- `src/routes` — HTTP handlers, one file per resource
- `src/services` — domain logic (pricing, stock, tax, shipping, returns)
- `src/middleware` — cross-cutting request wrappers (logging, service key)
- `src/utils` — small shared helpers
- `data` — seed catalog
