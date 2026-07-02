/** The subset of grocery-helper's OfferOut the collector consumes.
 * Location-bearing fields (store_name, store_id, id) are deliberately absent
 * from SnapshotRow — see mapOffer, which whitelists rather than deletes. */
export interface ApiOffer {
  chain: string;
  source: string;
  name: string;
  brand: string | null;
  category: string;
  group_label: string | null;
  price_cents: number;
  regular_price_cents: number | null;
  discount_pct: number | null;
  unit: string | null;
  unit_price_cents: number | null;
  is_bio: boolean;
  valid_from: string | null;
  valid_to: string | null;
  image_url: string | null;
}

export interface SnapshotRow {
  chain: string;
  source: string;
  name: string;
  name_key: string;
  brand: string | null;
  category: string;
  group_label: string | null;
  price_cents: number;
  regular_price_cents: number | null;
  discount_pct: number | null;
  unit: string | null;
  unit_price_cents: number | null;
  is_bio: boolean;
  valid_from: string | null;
  valid_to: string | null;
  image_url: string | null;
}

export interface Snapshot {
  schema: 1;
  region: string;
  week: string;
  collected_at: string;
  count: number;
  offers: SnapshotRow[];
}

export interface ProductStats {
  min: number;
  median: number;
  max: number;
  last: number;
  weeks_seen: number;
  appearances: number;
}

export type Verdict = 'true_low' | 'typical' | 'worse' | 'new';

/** [week, price_cents, unit_price_cents|null] — min deal price seen that week. */
export type SeriesPoint = [string, number, number | null];

export interface ProductEntry {
  region: string;
  chain: string;
  name_key: string;
  label: string;
  category: string;
  group_label: string | null;
  is_bio: boolean;
  image_url: string | null;
  series: SeriesPoint[];
  stats: ProductStats;
  last_week: string;
  verdict: Verdict;
}

export interface PriceIndex {
  schema: 1;
  generated_at: string;
  regions: string[];
  weeks: string[];
  products: ProductEntry[];
}
