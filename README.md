# Grocery Price History

Is that supermarket "deal" really a deal? This repo keeps the weekly offer data that
supermarkets throw away. Every week it snapshots the deduped offers from the
[grocery-helper](https://github.com/Ali0600/grocery-helper) API into git, folds them into a
price timeline per product, and judges each new "deal" against that product's own history:
`true_low` (never been cheaper), `typical` (the usual rotation price dressed up as a deal),
or `worse` (dearer than its own history).

**Zero infrastructure:** GitHub Actions runs the code, the repo is the database
(append-only weekly snapshots under [`data/snapshots/`](data/snapshots/)), and the derived
[`data/index.json`](data/index.json) is the product index you query. Every catalog change is
a git commit, so `git log -p data/` *is* the audit trail.

## How it works

```
grocery-helper (Render)                this repo
  Sun 06:00 UTC wipe + re-scrape         Sun 09:00 UTC collect.yml:
  GET /api/offers ────────────────────►    scripts/collect.ts  → data/snapshots/berlin-2026-W28.json
                                           scripts/aggregate.ts → data/index.json + index-min.json
                                           commit + push
```

- **Collector** (`scripts/collect.ts`) fetches the full deduped offer list (retry ×3, because
  Render's free tier starts cold), keeps only whitelisted fields row by row, and labels the
  snapshot with the most common ISO week of the offers' validity (deals run Mon–Sat; the Sunday
  run sees next week's flyers).
- **Product identity across weeks** is `(chain, name_key)`. `src/normalize.ts` is a
  unicode-careful port of grocery-helper's dedup normalization, so spelling variants between
  brochures (curly apostrophes, »decorative quotes«, produce grade tokens) map to one series.
- **Aggregation** (`src/aggregate.ts`) keeps the lowest deal price per product per week,
  then derives min/median/max stats and a history-relative verdict for each product.
- **Guardrails:** a response with under 300 offers, or with a single chain, is refused. That is
  the upstream's sample-data fallback, not a real week. The run fails loudly and opens a
  deduplicated `collect-failure` issue instead of committing a poisoned week.

## Honest methodology note

Flyers only publish *deal* prices (REWE/EDEKA carry no regular price), so verdicts are
**history-relative**. A `typical` verdict means "this 'deal' appears at this price all the
time" — the sign of a rotation price — not a comparison against a shelf price we never see.
Verdicts need ≥3 weeks of history; younger products report `new`.

## Data

- `data/snapshots/<region>-<ISO week>.json` — one append-only snapshot per region per week.
  **No location data**: rows carry the chain (`lidl`/`rewe`/`edeka`), never a store branch,
  address, or postal code. The region is deliberately coarse (`berlin`).
- `data/index.json` — per `(region, chain, name_key)`: display label, category,
  `series: [[week, price_cents, unit_price_cents]]`, stats, and the current verdict.
- `data/index-min.json` — the same shape, filtered to **`weeks_seen >= 2`**. Two sightings is
  the least that supports a comparison; one supports none. As of 2026-W37 that is 1,974 of
  13,377 products — **882 KB instead of 5.67 MB**, a 6.4x reduction that drops nothing a consumer
  could have shown. The envelope keeps the full `weeks` array, and `stats` passes through
  untouched (see `filterToTrend`).

### These two files are a published API

The **grocery-helper mobile app** (`mobile/src/usePriceHistory.ts`) reads both files straight off
`raw.githubusercontent.com/.../main/data/…`. It fetches `index-min.json`, narrows it to the
products in the user's History, and caches only that subset. So:

- the **paths are load-bearing** — rename or move either file and installed apps break, because
  they have no way to find a new location;
- the field names under `products[]` are a contract, and `stats.weeks_seen` in particular decides
  which tier the app shows;
- the client refuses to parse a body over its size tripwire, which is *why* the filtered file
  exists — the full index crosses it around week 26 of collection.

`src/publish.test.ts` pins the shape and the subset relationship.

## Run locally

```bash
npm install
npm run collect      # fetch this week's offers → data/snapshots/
npm run aggregate    # rebuild data/index.json + data/index-min.json
npm test             # vitest (normalization parity, verdicts, guards)
npm run lint && npm run typecheck
```

`API_URL` overrides the source API (default: the public grocery-helper instance);
`REGION` overrides the region label (default: `berlin`).

## Roadmap

1. **Collect** (this repo, live) — snapshots grow weekly; started 2026-W27.
2. **Website** — search, price timelines, and a "rotation prices" hall of shame, plus a
   keyless `GET /api/verdicts` for integrators (Next.js on Vercel).
3. **grocery-helper integration** — a `price_verdict` on each offer at serve time, shown in
   the app as a badge like the Bio pill.

## Experience Gained

- Designed a **zero-infrastructure data pipeline**: GitHub Actions as the scheduled runtime,
  a git repository as an append-only, auditable datastore, and a derived JSON index as the
  query layer — no servers, no managed database, $0/month.
- Built a **price-history dataset over time** (11 weekly snapshots so far, 2026-W27 to W37) from
  a source that wipes itself weekly, matching products across weeks with a ported, unit-tested
  text normalization (unicode-aware `\w`/`\b` parity between Python and JavaScript regexes).
- Added **data-quality guardrails that fail loudly**: sample-fallback detection refuses
  to commit poisoned weeks, and failures open a deduplicated GitHub issue instead of passing
  quietly.
- Wired **producer/consumer decoupling between two services** — this pipeline consumes a
  public API owned by another project and will serve verdicts back to it, so each side can
  deploy on its own.
