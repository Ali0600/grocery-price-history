import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex } from '../src/aggregate.js';
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
console.log(
  `wrote data/index.json: ${index.products.length} products across ${index.weeks.length} week(s) (${index.weeks.join(', ')})`,
);
