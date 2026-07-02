import { describe, expect, it } from 'vitest';

import { nameKey } from './normalize.js';

/** Parity cases mirror grocery-helper's backend/tests/test_dedup.py — the two
 * normalizations must agree or products fork into new series mid-history. */
describe('nameKey', () => {
  it('drops curly vs straight apostrophes', () => {
    expect(nameKey("Butcher's Angus Patties")).toBe(nameKey('Butcher’s Angus Patties'));
    expect(nameKey("Butcher's Angus Patties")).toBe('butchers angus patties');
  });

  it('strips decorative German quotes and the produce grade token', () => {
    expect(nameKey('REWE Feine Welt Essreife Avocado »Hass«, Kl. I')).toBe(
      nameKey('REWE Feine Welt Essreife Avocado Hass'),
    );
  });

  it('keeps umlauts and ß as word characters (unlike ASCII \\w)', () => {
    expect(nameKey('Möhren süß')).toBe('möhren süß');
  });

  it('does not strip "kl"-like fragments inside words', () => {
    expect(nameKey('Dunkle Schokolade 3')).toBe('dunkle schokolade 3');
    expect(nameKey('Klasse Käse')).toBe('klasse käse');
  });

  it('strips grade variants: Kl. II, Klasse 1', () => {
    expect(nameKey('Tomaten Kl. II')).toBe('tomaten');
    expect(nameKey('Äpfel Klasse 1')).toBe('äpfel');
  });

  it('maps punctuation to spaces and collapses whitespace', () => {
    expect(nameKey('Joghurt,  Natur - 3,8%')).toBe('joghurt natur 3 8');
  });

  it('handles null/undefined/empty', () => {
    expect(nameKey(null)).toBe('');
    expect(nameKey(undefined)).toBe('');
    expect(nameKey('  ')).toBe('');
  });
});
