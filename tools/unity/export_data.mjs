// Copies the web version's data tables (game/src/data/*.js) into the Unity project as JSON, so both versions read the
// same numbers while the rules move over. Only plain data is exported (helper functions stay behind).
//   node tools/unity/export_data.mjs   → unity/Assets/Resources/Data/<table>.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'game', 'src', 'data');
const out = join(here, '..', '..', 'unity', 'Assets', 'Resources', 'Data');
mkdirSync(out, { recursive: true });

const MODULES = ['items', 'pets', 'skills', 'natures', 'elements', 'recipes', 'crops', 'npcs', 'quests'];
const written = [];
for (const m of MODULES) {
  const mod = await import(`file://${join(src, m + '.js').replace(/\\/g, '/')}`);
  const data = {};
  for (const [k, v] of Object.entries(mod)) {
    if (typeof v === 'function') continue;
    if (/_BY_ID$/.test(k)) continue;              // lookups rebuilt in C#
    data[k] = v;
  }
  writeFileSync(join(out, m + '.json'), JSON.stringify(data, null, 1));
  written.push(`${m}: ${Object.keys(data).join(', ')}`);
}
console.log(written.join('\n'));
