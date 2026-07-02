import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSnapshot, DEFAULT_API_URL, fetchOffers, GuardError } from '../src/collect.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.API_URL || DEFAULT_API_URL;
const region = process.env.REGION || 'berlin';

const offers = await fetchOffers(baseUrl);
console.log(`fetched ${offers.length} offers from ${baseUrl}`);

try {
  const snapshot = buildSnapshot(offers, region, new Date());
  const dir = join(root, 'data', 'snapshots');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${region}-${snapshot.week}.json`);
  await writeFile(file, JSON.stringify(snapshot, null, 1) + '\n');
  const chains = [...new Set(snapshot.offers.map((o) => o.chain))].sort().join(', ');
  console.log(`wrote ${file}: ${snapshot.count} offers (${chains}) for week ${snapshot.week}`);
} catch (err) {
  if (err instanceof GuardError) {
    console.error(`refusing to snapshot: ${err.message}`);
    process.exit(2);
  }
  throw err;
}
