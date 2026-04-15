/**
 * Pepesto API Example — PLN price tracker — weekly staples
 * Supermarket: Auchan PL (zakupy.auchan.pl)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/auchan-pl/
 * Docs: https://pepesto.com/api
 *
 * Run: node auchan-pl-price-tracker-weekly.js
 * Requires: PEPESTO_API_KEY env var
 *
 * Strategy:
 *   1. POST /api/catalog for zakupy.auchan.pl → full product snapshot
 *   2. Extract prices for weekly staple items
 *   3. Compare against a hard-coded previous week's snapshot
 *   4. Print a diff: which items went up, down, or stayed the same
 *
 * In production you'd persist snapshots to a file or database each week
 * and load the previous one from there.
 */

const BASE_URL = 'https://s.pepesto.com/api';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.PEPESTO_API_KEY}`,
};

// ─── Staple items to track (Auchan PL product URLs) ──────────────────────────
// Real product URLs from the zakupy.auchan.pl catalog.
const TRACKED_PRODUCTS = [
  {
    url: 'https://zakupy.auchan.pl/products/%C5%82opatka-wieprzowa-auchan-300-g/00971824',
    label: 'Łopatka wieprzowa Auchan 300 g',
    category: 'meat',
  },
  {
    url: 'https://zakupy.auchan.pl/products/%C5%82opatka-bez-ko%C5%9Bci-auchan-na-wag%C4%99-ok-1-kg/00571717',
    label: 'Łopatka bez kości Auchan ~1 kg',
    category: 'meat',
  },
  {
    url: 'https://zakupy.auchan.pl/products/%C5%82opatka-wieprzowa-bez-ko%C5%9Bci-auchan-na-wag%C4%99-ok-1-3kg/00571716',
    label: 'Łopatka wieprzowa bez kości Auchan ~1.3 kg',
    category: 'meat',
  },
  {
    url: 'https://zakupy.auchan.pl/products/%C5%82ata-wo%C5%82owa-auchan-na-wag%C4%99-ok-500-g/00569968',
    label: 'Łata wołowa Auchan (Beef Flank) ~500 g',
    category: 'meat',
  },
  {
    url: 'https://zakupy.auchan.pl/products/%C5%82oso%C5%9B-%C5%9Bwie%C5%BCy-4-porcje-mowi-400-g/00117799',
    label: 'Łosoś świeży Mowi 400 g',
    category: 'fish',
  },
];

// ─── Previous week's snapshot (hard-coded for the diff) ──────────────────────
// In a real setup you'd load this from prices-YYYY-WW.json
const LAST_WEEK_PRICES = {
  'https://zakupy.auchan.pl/products/%C5%82opatka-wieprzowa-auchan-300-g/00971824': 849,
  'https://zakupy.auchan.pl/products/%C5%82opatka-bez-ko%C5%9Bci-auchan-na-wag%C4%99-ok-1-kg/00571717': 1850,
  'https://zakupy.auchan.pl/products/%C5%82opatka-wieprzowa-bez-ko%C5%9Bci-auchan-na-wag%C4%99-ok-1-3kg/00571716': 2077,
  'https://zakupy.auchan.pl/products/%C5%82ata-wo%C5%82owa-auchan-na-wag%C4%99-ok-500-g/00569968': 1799,
  'https://zakupy.auchan.pl/products/%C5%82oso%C5%9B-%C5%9Bwie%C5%BCy-4-porcje-mowi-400-g/00117799': 6299,
};

// ─── Fetch catalog snapshot ───────────────────────────────────────────────────

async function fetchCatalog() {
  console.log('Fetching Auchan PL catalog snapshot…\n');

  const response = await fetch(`${BASE_URL}/catalog`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ supermarket_domain: 'zakupy.auchan.pl' }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST /api/catalog failed (${response.status}): ${text}`);
  }

  return response.json();
}

// ─── Build weekly diff ────────────────────────────────────────────────────────

function buildDiff(parsedProducts) {
  const diff = [];

  for (const tracked of TRACKED_PRODUCTS) {
    const current = parsedProducts[tracked.url];
    const currentPrice = current?.price ?? null;
    const lastPrice    = LAST_WEEK_PRICES[tracked.url] ?? null;

    let change = null;
    let direction = '=';
    if (currentPrice !== null && lastPrice !== null) {
      change = currentPrice - lastPrice;
      if (change > 0)  direction = '↑';
      if (change < 0)  direction = '↓';
    }

    diff.push({
      label: tracked.label,
      category: tracked.category,
      currentPrice,
      lastPrice,
      change,
      direction,
    });
  }

  return diff;
}

// ─── Print diff report ────────────────────────────────────────────────────────

function printDiff(diff) {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  Auchan PL Weekly Price Tracker');
  console.log('══════════════════════════════════════════════════════════════════════\n');
  console.log(`  ${'Product'.padEnd(42)} ${'Last week'.padStart(10)} ${'This week'.padStart(10)} ${'Change'.padStart(10)}`);
  console.log(`  ${'-'.repeat(42)} ${'-'.repeat(10)} ${'-'.repeat(10)} ${'-'.repeat(10)}`);

  for (const item of diff) {
    const last    = item.lastPrice    !== null ? (item.lastPrice / 100).toFixed(2)    + ' zł' : '—';
    const current = item.currentPrice !== null ? (item.currentPrice / 100).toFixed(2) + ' zł' : '—';
    const change  = item.change       !== null
      ? (item.change >= 0 ? '+' : '') + (item.change / 100).toFixed(2) + ' zł'
      : '—';

    const dir = item.direction === '↑' ? '\x1b[31m↑\x1b[0m' : item.direction === '↓' ? '\x1b[32m↓\x1b[0m' : '=';
    console.log(`  ${item.label.padEnd(42)} ${last.padStart(10)} ${current.padStart(10)} ${dir} ${change.padStart(8)}`);
  }

  const totalLast    = diff.reduce((s, i) => s + (i.lastPrice ?? 0), 0);
  const totalCurrent = diff.reduce((s, i) => s + (i.currentPrice ?? 0), 0);
  const totalChange  = totalCurrent - totalLast;

  console.log(`\n  ${'TOTAL BASKET'.padEnd(42)} ${((totalLast / 100).toFixed(2) + ' zł').padStart(10)} ${((totalCurrent / 100).toFixed(2) + ' zł').padStart(10)} ${(totalChange >= 0 ? '+' : '') + (totalChange / 100).toFixed(2)} zł`);

  if (totalChange > 0) {
    console.log('\n  Verdict: basket is MORE expensive this week.');
  } else if (totalChange < 0) {
    console.log('\n  Verdict: basket is CHEAPER this week. Good week to stock up.');
  } else {
    console.log('\n  Verdict: prices unchanged this week.');
  }
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.PEPESTO_API_KEY) {
    console.error('Error: PEPESTO_API_KEY env var is not set.');
    console.error('  export PEPESTO_API_KEY=pep_sk_your_key_here');
    process.exit(1);
  }

  const catalogData = await fetchCatalog();

  // Example catalog response shape:
  //
  // {
  //   "parsed_products": {
  //     "https://zakupy.auchan.pl/products/%C5%82opatka-wieprzowa-auchan-300-g/00971824": {
  //       "entity_name": "Pork shoulder",
  //       "names": { "en": "Auchan Pork Shoulder", "pl": "Łopatka wieprzowa Auchan" },
  //       "price": 888,
  //       "price_per_meausure_unit": "29.60 zł/kg",
  //       "quantity_str": "300g"
  //     },
  //     "https://zakupy.auchan.pl/products/%C5%82ata-wo%C5%82owa-auchan-na-wag%C4%99-ok-500-g/00569968": {
  //       "entity_name": "Beef",
  //       "names": { "en": "Auchan Beef Flank Steak", "pl": "Łata wołowa Auchan" },
  //       "price": 1850,
  //       "price_per_meausure_unit": "36.99 zł/kg",
  //       "quantity_str": "500g"
  //     }
  //   }
  // }

  const parsedProducts = catalogData.parsed_products ?? {};
  const diff = buildDiff(parsedProducts);
  printDiff(diff);

  // Tip: persist this week's snapshot for next week's diff
  console.log('// Tip — save this week\'s prices to disk:');
  const snapshot = {};
  for (const tracked of TRACKED_PRODUCTS) {
    const p = parsedProducts[tracked.url];
    if (p) snapshot[tracked.url] = p.price;
  }
  console.log('// const fs = await import(\'fs/promises\');');
  console.log('// await fs.writeFile(\'prices-2026-W16.json\', JSON.stringify(snapshot, null, 2));');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
