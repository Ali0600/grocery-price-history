import { nameKey } from './normalize.js';
import { snapshotWeek } from './week.js';
import type { ApiOffer, Snapshot, SnapshotRow } from './types.js';

export const DEFAULT_API_URL = 'https://grocery-helper-sw6c.onrender.com';

/** Below this many offers the response is assumed to be a sample-data fallback
 * or partial scrape (a real Berlin week is ~700–1050 after dedup) — the
 * snapshot is refused rather than committed as a poisoned week. */
export const MIN_OFFERS = 300;
export const MIN_CHAINS = 2;

export class GuardError extends Error {}

/** Whitelist-map an API offer to a snapshot row. Never spread or delete:
 * building the row field-by-field means a future OfferOut field (which could
 * carry location again — the API serves store_name today) can't leak into the
 * public dataset by default. */
export function mapOffer(o: ApiOffer): SnapshotRow {
  return {
    chain: o.chain,
    source: o.source,
    name: o.name,
    name_key: nameKey(o.name),
    brand: o.brand ?? null,
    category: o.category,
    group_label: o.group_label ?? null,
    price_cents: o.price_cents,
    regular_price_cents: o.regular_price_cents ?? null,
    discount_pct: o.discount_pct ?? null,
    unit: o.unit ?? null,
    unit_price_cents: o.unit_price_cents ?? null,
    is_bio: o.is_bio ?? false,
    valid_from: o.valid_from ?? null,
    valid_to: o.valid_to ?? null,
    image_url: o.image_url ?? null,
  };
}

export function buildSnapshot(offers: ApiOffer[], region: string, now: Date): Snapshot {
  if (offers.length < MIN_OFFERS) {
    throw new GuardError(
      `only ${offers.length} offers (< ${MIN_OFFERS}) — looks like a sample-data fallback or partial scrape; refusing to snapshot`,
    );
  }
  const chains = new Set(offers.map((o) => o.chain));
  if (chains.size < MIN_CHAINS) {
    throw new GuardError(
      `only ${chains.size} chain(s) in the response — a real week has several; refusing to snapshot`,
    );
  }
  const rows = offers.map(mapOffer);
  return {
    schema: 1,
    region,
    week: snapshotWeek(rows.map((r) => r.valid_from), now),
    collected_at: now.toISOString(),
    count: rows.length,
    offers: rows,
  };
}

/** Fetch the full deduped offer list. Render's free tier sleeps after ~15 min
 * idle and a cold start re-runs the boot scrape, so the first attempt can be
 * slow or fail — retry with a pause, generous per-attempt timeout. */
export async function fetchOffers(
  baseUrl: string,
  attempts = 3,
  pauseMs = 30_000,
): Promise<ApiOffer[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/offers?limit=2000`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return (await res.json()) as ApiOffer[];
    } catch (err) {
      lastError = err;
      console.warn(`attempt ${attempt}/${attempts} failed: ${String(err)}`);
      if (attempt < attempts) await new Promise((r) => setTimeout(r, pauseMs));
    }
  }
  throw lastError;
}
