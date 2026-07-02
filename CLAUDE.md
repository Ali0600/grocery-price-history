# Grocery Price History — agent notes

Weekly price-history collector over the grocery-helper API. The repo is the database:
`data/snapshots/<region>-<week>.json` are append-only weekly captures, `data/index.json`
is the derived per-product index. See [README.md](README.md) for the architecture.

## Commands
- `npm run collect` — fetch live offers → write this week's snapshot (env: `API_URL`, `REGION`)
- `npm run aggregate` — fold all snapshots → `data/index.json`
- `npm test` / `npm run lint` / `npm run typecheck` — vitest / eslint (flat config) / tsc

## Non-negotiables
- **Privacy: snapshots must never contain location data.** The upstream `OfferOut` carries
  `store_name` (a branch name that can reveal the scraped neighbourhood — the PLZ there is
  personal, env-driven, and was history-purged from that repo). `mapOffer` in
  `src/collect.ts` therefore **whitelists** fields one-by-one; never switch it to a spread/
  delete approach, and never add store/branch/PLZ/coordinate fields. The vitest privacy test
  and the first-snapshot grep in the verification steps guard this.
- **`src/normalize.ts` must stay in parity with grocery-helper's `backend/app/dedup.py`
  `_norm_name`** — it's the cross-week product identity. If that changes, port the change
  and extend `normalize.test.ts` (cases mirror `backend/tests/test_dedup.py`). Beware:
  Python `\w`/`\b` are unicode-aware, JS's are ASCII-only — hence `\p{L}\p{N}` classes and
  lookarounds instead of `\b`.
- **Never edit committed snapshots** (append-only history is the product). The index is
  derived — regenerate it, don't hand-edit.

## Gotchas
- **Snapshot week ≠ fetch week**: the Sunday 09:00 UTC run happens after grocery-helper's
  06:00 UTC wipe-and-rescrape, so the API already serves *next* week's Mon–Sat flyers. The
  snapshot is labelled by the modal ISO week of `valid_from` (`src/week.ts`), falling back
  to the fetch date only if no offer has validity dates.
- **Guardrails refuse, they don't fallback**: <300 offers or <2 chains → `GuardError`, exit
  code 2, **no file written**; `collect.yml` then opens/updates a `collect-failure` issue.
  A sparse week usually means the upstream served its sample-data fallback — re-run the
  dispatch once the source recovers.
- Same product at several prices in one week (pack variants normalizing to one key):
  aggregation keeps the **min** price per week — comparisons are against the best deal.
- Upstream reference numbers: a real Berlin week is ~700–1050 deduped offers across
  lidl/rewe/edeka (+ e_center). Both scrape-time and serve-time dedup already ran upstream;
  don't re-dedup here beyond the per-week min.
- The API URL default lives in `src/collect.ts` (`DEFAULT_API_URL`, the public Render
  instance). It's a public URL — a plain env override, not a secret.

## Conventions
- Branching: no deploy wiring yet → work directly on `main`. Once Vercel (website phase)
  is wired, switch to branch + PR + merge-on-green for anything that ships.
- Commits: author as the user only — no `Co-Authored-By: Claude` trailer.
- Pure logic lives in `src/` (unit-tested); `scripts/` are thin CLI wrappers doing I/O.
