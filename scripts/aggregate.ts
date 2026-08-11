import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex, filterToTrend, MIN_WEEKS_FOR_TREND } from '../src/aggregate.js';
import type { Snapshot } from '../src/types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'snapshots');

const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error(`no snapshots in ${dir} — run \`npm run collect\` first`);
  process.exit(2);
}

const snapshots: Snapshot[] = [];
for (const f of files) {
  snapshots.push(JSON.parse(await readFile(join(dir, f), 'utf8')) as Snapshot);
}

const index = buildIndex(snapshots, new Date());
await writeFile(join(root, 'data', 'index.json'), JSON.stringify(index) + '\n');

// The second, filtered index — the one the grocery-helper app reads.
//
// 93.75% of products have been seen in exactly ONE week (6,176 of 6,588 as of 2026-W31), and
// a single sighting supports no comparison: the app renders those as nothing at all. Serving
// them anyway costs 2.76 MB per fetch and grows ~420 B per product per week, which walks into
// the client's own 2.5 MB refuse-to-parse tripwire around week 26 of collection. Filtering to
// `weeks_seen >= 2` is 412 products / 177 KB — a 15x reduction — and drops nothing the
// consumer could have displayed. See `filterToTrend` for what it deliberately preserves.
const minIndex = filterToTrend(index);
await writeFile(join(root, 'data', 'index-min.json'), JSON.stringify(minIndex) + '\n');

console.log(
  `wrote data/index.json: ${index.products.length} products across ${index.weeks.length} week(s) (${index.weeks.join(', ')})`,
);
console.log(
  `wrote data/index-min.json: ${minIndex.products.length} products (weeks_seen >= ${MIN_WEEKS_FOR_TREND})`,
);
