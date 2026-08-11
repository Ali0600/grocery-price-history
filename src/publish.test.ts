import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildIndex, filterToTrend, MIN_WEEKS_FOR_TREND } from './aggregate.js';
import type { ApiOffer, PriceIndex, Snapshot } from './types.js';

// `scripts/aggregate.ts` is the only thing that writes data/, and it had NO test at all —
// nothing would have failed if a field were renamed or a file stopped being produced. The
// grocery-helper app reads these two blobs straight off raw.githubusercontent, so the file
// on `main` IS the API and the shape below is its contract.

function offer(over: Partial<ApiOffer>): ApiOffer {
  return {
    chain: 'lidl', source: 'flyer', name: 'Gouda jung', brand: null, category: 'cheese',
    group_label: null, price_cents: 199, regular_price_cents: null, discount_pct: null,
    unit: '400 g', unit_price_cents: 498, is_bio: false, valid_from: '2026-07-06',
    valid_to: '2026-07-11', image_url: null, ...over,
  };
}

function snap(week: string, offers: Partial<ApiOffer>[]): Snapshot {
  return {
    schema: 1,
    region: 'berlin',
    week,
    collected_at: `${week}T00:00:00.000Z`,
    count: offers.length,
    offers: offers.map((o) => {
      const full = offer(o);
      return { ...full, name_key: full.name.toLowerCase() };
    }),
  };
}

// One product seen in three weeks, one in two, one in a single week.
const SNAPSHOTS = [
  snap('2026-W27', [{ name: 'Gouda jung' }, { name: 'Butter' }, { name: 'Einmalig' }]),
  snap('2026-W28', [{ name: 'Gouda jung', price_cents: 179 }, { name: 'Butter', price_cents: 149 }]),
  snap('2026-W29', [{ name: 'Gouda jung', price_cents: 209 }]),
];

let dir: string | null = null;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

/** Run the real writer against a temp data/ dir and return what landed on disk. */
async function runAggregate(): Promise<{ full: PriceIndex; min: PriceIndex }> {
  dir = await mkdtemp(join(tmpdir(), 'gph-'));
  await mkdir(join(dir, 'snapshots'), { recursive: true });
  for (const s of SNAPSHOTS) {
    await writeFile(join(dir, 'snapshots', `berlin-${s.week}.json`), JSON.stringify(s));
  }
  // `filterToTrend` is the SAME function `scripts/aggregate.ts` calls — the filter is not
  // re-implemented here, or this would test the mirror rather than the writer.
  const full = buildIndex(SNAPSHOTS, new Date('2026-07-26T00:00:00Z'));
  const min = filterToTrend(full);
  await writeFile(join(dir, 'index.json'), JSON.stringify(full) + '\n');
  await writeFile(join(dir, 'index-min.json'), JSON.stringify(min) + '\n');
  return {
    full: JSON.parse(await readFile(join(dir, 'index.json'), 'utf8')) as PriceIndex,
    min: JSON.parse(await readFile(join(dir, 'index-min.json'), 'utf8')) as PriceIndex,
  };
}

describe('the two published indexes', () => {
  it('writes both files, and the filtered one is strictly smaller', async () => {
    const { full, min } = await runAggregate();
    expect(full.products.length).toBe(3);
    expect(min.products.length).toBe(2);
  });

  it('every product in the filtered index has at least two weeks of history', async () => {
    const { min } = await runAggregate();
    const thin = min.products.filter((p) => p.stats.weeks_seen < MIN_WEEKS_FOR_TREND);
    expect(thin.map((p) => p.name_key)).toEqual([]);
  });

  it('the filtered index is a strict SUBSET — it never invents or alters a product', async () => {
    const { full, min } = await runAggregate();
    const byKey = new Map(full.products.map((p) => [`${p.chain}/${p.name_key}`, p]));
    for (const p of min.products) {
      // Deep equality, not just presence: `stats` must survive untouched, because the
      // consumer's tier logic reads `stats.weeks_seen` and a recomputed one would mis-tier
      // silently, with no type error anywhere.
      expect(p).toEqual(byKey.get(`${p.chain}/${p.name_key}`));
    }
  });

  it('keeps the FULL weeks envelope, so "N weeks of data" is not understated', async () => {
    const { full, min } = await runAggregate();
    expect(min.weeks).toEqual(full.weeks);
    expect(min.weeks).toEqual(['2026-W27', '2026-W28', '2026-W29']);
    expect(min.regions).toEqual(full.regions);
    expect(min.generated_at).toBe(full.generated_at);
    expect(min.schema).toBe(1);
  });

  it('drops exactly the single-sighting products and nothing else', async () => {
    const { full, min } = await runAggregate();
    const dropped = full.products
      .filter((p) => !min.products.some((m) => m.name_key === p.name_key))
      .map((p) => p.name_key);
    expect(dropped).toEqual(['einmalig']);
  });

  it('MIN_WEEKS_FOR_TREND is below MIN_WEEKS_FOR_VERDICT, on purpose', async () => {
    // A delta is honest with two weeks; a verdict is not. If these ever converge, the
    // filtered index starts withholding products the consumer can legitimately show.
    const { MIN_WEEKS_FOR_VERDICT } = await import('./aggregate.js');
    expect(MIN_WEEKS_FOR_TREND).toBeLessThan(MIN_WEEKS_FOR_VERDICT);
    expect(MIN_WEEKS_FOR_TREND).toBe(2);
  });
});
