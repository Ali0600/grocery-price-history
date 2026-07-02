# Grocery Price History

Is that supermarket "deal" actually a deal? This repo keeps the weekly offer data that
supermarkets throw away: every week it snapshots the deduped offers from the
[grocery-helper](https://github.com/Ali0600/grocery-helper) API into git, folds them into
per-product price timelines, and judges each new "deal" against the product's own history —
`true_low` (never been cheaper), `typical` (the usual rotation price dressed up as a deal),
or `worse` (dearer than its own history).

**Zero infrastructure:** GitHub Actions is the runtime, the repo is the database
(append-only weekly snapshots under [`data/snapshots/`](data/snapshots/)), and the derived
[`data/index.json`](data/index.json) is the queryable product index. Every catalog change is
a git commit — `git log -p data/` *is* the audit trail.

## How it works

```
grocery-helper (Render)                this repo
  Sun 06:00 UTC wipe + re-scrape         Sun 09:00 UTC collect.yml:
  GET /api/offers ────────────────────►    scripts/collect.ts  → data/snapshots/berlin-2026-W28.json
                                           scripts/aggregate.ts → data/index.json
                                           commit + push
```

- **Collector** (`scripts/collect.ts`) fetches the full deduped offer list (retry ×3 —
  Render's free tier cold-starts), whitelists fields row-by-row, and labels the snapshot
  with the modal ISO week of the offers' validity (deals are Mon–Sat; the Sunday run sees
  next week's flyers).
- **Product identity across weeks** is `(chain, name_key)` — `src/normalize.ts` is a
  unicode-careful port of grocery-helper's dedup normalization, so per-brochure spelling
  variants (curly apostrophes, »decorative quotes«, produce grade tokens) map to one series.
- **Aggregation** (`src/aggregate.ts`) keeps the minimum deal price per product per week,
  then derives min/median/max stats and a history-relative verdict per product.
- **Guardrails:** a response under 300 offers or with a single chain is refused (that's the
  upstream's sample-data fallback, not a real week) and the run fails loudly — a
  deduplicated `collect-failure` issue is opened instead of committing a poisoned week.

## Honest methodology note

Flyers only publish *deal* prices (REWE/EDEKA carry no regular price), so verdicts are
**history-relative**: a `typical` verdict means "this 'deal' appears at this price all the
time" — the rotation-price tell — not a comparison against a shelf price we never see.
Verdicts need ≥3 weeks of history; younger products report `new`.

## Data

- `data/snapshots/<region>-<ISO week>.json` — one append-only snapshot per region per week.
  **No location data**: rows carry the chain (`lidl`/`rewe`/`edeka`), never a store branch,
  address, or postal code. Region granularity is deliberately coarse (`berlin`).
- `data/index.json` — per `(region, chain, name_key)`: display label, category,
  `series: [[week, price_cents, unit_price_cents]]`, stats, and the current verdict.

## Run locally

```bash
npm install
npm run collect      # fetch this week's offers → data/snapshots/
npm run aggregate    # rebuild data/index.json
npm test             # vitest (normalization parity, verdicts, guards)
npm run lint && npm run typecheck
```

`API_URL` overrides the source API (defaults to the public grocery-helper instance);
`REGION` overrides the region label (defaults to `berlin`).

## Roadmap

1. **Collect** (this repo, live) — snapshots compound weekly; started 2026-W27.
2. **Website** — search + price timelines + a "rotation prices" hall of shame, plus a
   keyless `GET /api/verdicts` for integrators (Next.js on Vercel).
3. **grocery-helper integration** — a serve-time `price_verdict` on each offer, badged in
   the app like the Bio pill.

## Experience Gained

- Designed a **zero-infrastructure data pipeline**: GitHub Actions as the scheduled runtime,
  a git repository as an append-only, auditable datastore, and a derived JSON index as the
  query layer — no servers, no managed database, $0/month.
- Built a **longitudinal price-history dataset** from a transient source (the upstream wipes
  itself weekly), with cross-week entity resolution via a ported, unit-tested text
  normalization (unicode-aware `\w`/`\b` parity between Python and JavaScript regexes).
- Implemented **data-quality guardrails that fail loudly**: sample-fallback detection refuses
  to commit poisoned weeks, and failures open a deduplicated GitHub issue instead of passing
  silently.
- Wired **producer/consumer decoupling between two services** — this pipeline consumes a
  public API owned by another project and will serve verdicts back to it, keeping each side
  independently deployable.
