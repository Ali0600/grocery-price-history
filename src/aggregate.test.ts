import { describe, expect, it } from 'vitest';

import { buildIndex, median, verdictFor } from './aggregate.js';
import type { ApiOffer, ProductStats, Snapshot } from './types.js';
import { buildSnapshot } from './collect.js';
import { MIN_OFFERS } from './collect.js';

function offer(over: Partial<ApiOffer>): ApiOffer {
  return {
    chain: 'lidl',
    source: 'flyer',
    name: 'Gouda jung',
    brand: null,
    category: 'cheese',
    group_label: null,
    price_cents: 199,
    regular_price_cents: null,
    discount_pct: null,
    unit: '400 g',
    unit_price_cents: 498,
    is_bio: false,
    valid_from: '2026-07-06',
    valid_to: '2026-07-11',
    image_url: null,
    ...over,
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

describe('median', () => {
  it('odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(3);
    expect(median([5])).toBe(5);
  });
});

describe('verdictFor', () => {
  const stats: ProductStats = { min: 100, median: 150, max: 200, last: 150, weeks_seen: 5, appearances: 6 };

  it('new when too few weeks seen', () => {
    expect(verdictFor({ ...stats, weeks_seen: 2 }, 100)).toBe('new');
  });
  it('true_low at or below the historical min', () => {
    expect(verdictFor(stats, 100)).toBe('true_low');
    expect(verdictFor(stats, 95)).toBe('true_low');
  });
  it('typical inside the rotation band around the median', () => {
    expect(verdictFor(stats, 150)).toBe('typical');
    expect(verdictFor(stats, 157)).toBe('typical');
  });
  it('worse above the band — the fake-deal case', () => {
    expect(verdictFor(stats, 165)).toBe('worse');
    expect(verdictFor(stats, 200)).toBe('worse');
  });
});

describe('buildIndex', () => {
  it('builds one series per (chain, name_key) across weeks, min price per week', () => {
    const index = buildIndex(
      [
        snap('2026-W27', [
          { price_cents: 199 },
          { price_cents: 179 },
          { name: 'Bananen', category: 'fruits', price_cents: 99 },
        ]),
        snap('2026-W28', [{ price_cents: 249 }]),
      ],
      new Date('2026-07-15T00:00:00Z'),
    );

    expect(index.weeks).toEqual(['2026-W27', '2026-W28']);
    expect(index.products).toHaveLength(2);

    const gouda = index.products.find((p) => p.name_key === 'gouda jung');
    expect(gouda).toBeDefined();
    expect(gouda?.series).toEqual([
      ['2026-W27', 179, 498],
      ['2026-W28', 249, 498],
    ]);
    expect(gouda?.stats).toMatchObject({ min: 179, max: 249, last: 249, weeks_seen: 2, appearances: 3 });
    expect(gouda?.verdict).toBe('new');
  });

  it('keeps the most common raw name as the label', () => {
    const index = buildIndex(
      [
        snap('2026-W27', [{ name: 'Butcher’s Patties' }, { name: 'Butcher’s Patties', price_cents: 220 }]),
        snap('2026-W28', [{ name: "Butcher's Patties" }]),
      ],
      new Date(),
    );
    expect(index.products).toHaveLength(2);
    const curly = index.products.find((p) => p.label === 'Butcher’s Patties');
    expect(curly?.stats.appearances).toBe(2);
  });
});

describe('buildSnapshot privacy + guards', () => {
  const many = (n: number, chain = 'lidl') =>
    Array.from({ length: n }, (_, i) => offer({ name: `Produkt ${i}`, chain }));

  it('rows carry no store/location fields', () => {
    const snapshot = buildSnapshot([...many(200), ...many(200, 'rewe')], 'berlin', new Date());
    const row = snapshot.offers[0] as unknown as Record<string, unknown>;
    for (const banned of ['store_name', 'store_id', 'id', 'plz', 'lat', 'lng', 'address']) {
      expect(row).not.toHaveProperty(banned);
    }
  });

  it('labels the snapshot with the modal valid_from week, not the fetch date', () => {
    const snapshot = buildSnapshot(
      [...many(200), ...many(200, 'rewe')],
      'berlin',
      new Date('2026-07-05T09:00:00Z'),
    );
    expect(snapshot.week).toBe('2026-W28');
  });

  it('refuses a small (sample-fallback) response', () => {
    expect(() => buildSnapshot(many(MIN_OFFERS - 1), 'berlin', new Date())).toThrow(/refusing/);
  });

  it('refuses a single-chain response', () => {
    expect(() => buildSnapshot(many(400, 'lidl'), 'berlin', new Date())).toThrow(/chain/);
  });
});
