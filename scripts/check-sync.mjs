// scripts/check-sync.mjs — run with: node scripts/check-sync.mjs
//
// Three of this project's shared contracts are deliberately duplicated rather
// than fetched at runtime: the business-type catalog, the goal list, and the
// brand palette. Duplication keeps the wizard instant (no round-trip before it
// can render) but it only stays safe if something notices when the copies
// drift. That's this script.
//
// Every mismatch it reports is one that has already bitten us in production:
// a palette that disagreed between wizard and admin paywalled every new signup
// out of their own branding form.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const { CATEGORIES, GOALS } = require(join(root, 'api/_niche-catalog.js'));
const { PALETTE } = require(join(root, 'api/_brand.js'));

const startHtml = readFileSync(join(root, 'start.html'), 'utf8');
const adminHtml = readFileSync(join(root, 'admin.html'), 'utf8');

const problems = [];

// Pull a `const NAME = [ ... ];` array literal out of a page and evaluate it.
// These are our own files, and the alternative is a brittle regex per field.
function extractArray(source, name, label) {
  const start = source.indexOf(`const ${name} = [`);
  if (start === -1) {
    problems.push(`${label}: could not find "const ${name} = [" — did it get renamed?`);
    return null;
  }
  const open = source.indexOf('[', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']') {
      depth--;
      if (depth === 0) {
        try {
          return Function(`"use strict"; return (${source.slice(open, i + 1)});`)();
        } catch (e) {
          problems.push(`${label}: ${name} did not parse — ${e.message}`);
          return null;
        }
      }
    }
  }
  problems.push(`${label}: ${name} array is unterminated.`);
  return null;
}

function compare(label, expected, actual, fields) {
  if (!actual) return;
  if (expected.length !== actual.length) {
    problems.push(`${label}: expected ${expected.length} entries, found ${actual.length}.`);
  }
  const n = Math.min(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    for (const f of fields) {
      const a = JSON.stringify(expected[i][f]);
      const b = JSON.stringify(actual[i][f]);
      if (a !== b) {
        problems.push(`${label}: entry ${i} (${expected[i].id || expected[i].value}) field "${f}" — source has ${a}, page has ${b}.`);
      }
    }
  }
  // Names present in one but not the other, regardless of order.
  const key = (o) => o.id || o.value;
  const missing = expected.map(key).filter((k) => !actual.some((o) => key(o) === k));
  const extra = actual.map(key).filter((k) => !expected.some((o) => key(o) === k));
  if (missing.length) problems.push(`${label}: missing from page — ${missing.join(', ')}`);
  if (extra.length) problems.push(`${label}: on page but not in source — ${extra.join(', ')}`);
}

// 1. Business-type catalog: api/_niche-catalog.js -> start.html CATALOG
compare(
  'start.html CATALOG vs api/_niche-catalog.js CATEGORIES',
  CATEGORIES,
  extractArray(startHtml, 'CATALOG', 'start.html'),
  ['id', 'label', 'example', 'services']
);

// 2. Goals: only id + label are mirrored. `tip` is server-side copy delivered
//    in the signup response, so it deliberately does NOT appear in the page.
compare(
  'start.html GOALS vs api/_niche-catalog.js GOALS',
  GOALS,
  extractArray(startHtml, 'GOALS', 'start.html'),
  ['id', 'label']
);

// 3. Palette: api/_brand.js -> admin.html BRAND_PRESETS
compare(
  'admin.html BRAND_PRESETS vs api/_brand.js PALETTE',
  PALETTE,
  extractArray(adminHtml, 'BRAND_PRESETS', 'admin.html'),
  ['name', 'value']
);

// 4. Palette: api/_brand.js -> start.html swatch markup (data-c attributes)
const swatchHexes = [...startHtml.matchAll(/class="swatch[^"]*"\s+data-c="(#[0-9A-Fa-f]{6})"/g)]
  .map((m) => m[1].toUpperCase());
const paletteHexes = PALETTE.map((p) => p.value.toUpperCase());
if (swatchHexes.length === 0) {
  problems.push('start.html: found no .swatch[data-c] colours — did the markup change?');
} else if (JSON.stringify(swatchHexes) !== JSON.stringify(paletteHexes)) {
  problems.push(
    `start.html swatches vs api/_brand.js PALETTE:\n    page:   ${swatchHexes.join(', ')}\n    source: ${paletteHexes.join(', ')}`
  );
}

// 5. Free service cap: api/_brand.js -> start.html
const { FREE_SERVICE_CAP } = require(join(root, 'api/_brand.js'));
const capMatch = startHtml.match(/const FREE_SERVICE_CAP\s*=\s*(\d+)/);
if (!capMatch) {
  problems.push('start.html: FREE_SERVICE_CAP not found.');
} else if (Number(capMatch[1]) !== FREE_SERVICE_CAP) {
  problems.push(`start.html FREE_SERVICE_CAP is ${capMatch[1]}, api/_brand.js says ${FREE_SERVICE_CAP}.`);
}

// A preset menu longer than the cap would hand someone a menu they can't save.
for (const c of CATEGORIES) {
  if (c.services.length > FREE_SERVICE_CAP) {
    problems.push(`api/_niche-catalog.js: category "${c.id}" has ${c.services.length} preset services, over the ${FREE_SERVICE_CAP} free cap.`);
  }
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} sync problem${problems.length === 1 ? '' : 's'} found:\n`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error('');
  process.exit(1);
}

console.log('✓ catalog, goals, palette and service cap are in sync across all files.');
