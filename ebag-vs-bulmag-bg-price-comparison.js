/**
 * Pepesto API Example — Comparing prices between Bulgaria's two online stores
 * Supermarket: eBag (ebag.bg) vs Bulmag (bulmag.org)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/ebag/
 * Docs: https://pepesto.com/api
 *
 * Run: node ebag-vs-bulmag-bg-price-comparison.js
 * Requires: PEPESTO_API_KEY env var
 *
 * Strategy:
 *   1. POST /api/parse on a traditional Bulgarian musaka (moussaka) recipe
 *   2. POST /api/products at ebag.bg  → prices from eBag
 *   3. POST /api/products at bulmag.org → prices from Bulmag
 *   4. Compare item-by-item — which store wins per ingredient?
 *   5. Total up both baskets and declare a winner
 */

const BASE_URL = 'https://s.pepesto.com/api';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.PEPESTO_API_KEY}`,
};

// Traditional Bulgarian musaka recipe
const RECIPE_URL = 'https://recepti.gotvach.bg/r-9784-%D0%9A%D0%BB%D0%B0%D1%81%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B0_%D0%BC%D1%83%D1%81%D0%B0%D0%BA%D0%B0';

// ─── Step 1: Parse recipe ─────────────────────────────────────────────────────

async function parseRecipe(url) {
  console.log(`Parsing recipe: ${url}\n`);

  const response = await fetch(`${BASE_URL}/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_url: url,
      locale: 'bg-BG',
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`POST /api/parse failed (${response.status}): ${text}`);
  }

  const data = JSON.parse(text);

  return data;
}

// ─── Step 2: Match to a given supermarket ────────────────────────────────────

async function matchToStore(kgToken, domain) {
  const body = JSON.stringify({ recipe_kg_tokens: [kgToken], supermarket_domain: domain });

  const response = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers,
    body,
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`POST /api/products (${domain}) failed (${response.status}): ${text}`);
  }

  const data = JSON.parse(text);

  return data;
}

// ─── Helper: build a flat price map ──────────────────────────────────────────
// Returns { [item_name]: { ingredient, name, price } }

function buildPriceMap(productsData) {
  const map = {};
  for (const item of productsData.items ?? []) {
    if (!item.products?.length) continue;
    const p = item.products[0].product; // sorted best-first by API
    map[item.item_name] = {
      ingredient: item.item_name,
      name: p.product_name ?? '—',
      price: p.price?.price ?? null,
    };
  }
  return map;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.PEPESTO_API_KEY) {
    console.error('Error: PEPESTO_API_KEY env var is not set.');
    console.error('  export PEPESTO_API_KEY=pep_sk_your_key_here');
    process.exit(1);
  }

  // --- Parse ---
  const parseData = await parseRecipe(RECIPE_URL);
  const recipe    = parseData.recipe;
  console.log(`Recipe: "${recipe.title}" — ${recipe.ingredients.length} ingredients\n`);

  // Example parse response for musaka:
  //
  // {
  //   "recipe": {
  //     "title": "Мусака с картофени пагони",
  //     "ingredients": [
  //       "500g кайма (свинска или смесена)",
  //       "800g картофи",
  //       "2 яйца",
  //       "200ml мляко",
  //       "1 лук",
  //       "2 домата",
  //       "50ml слънчогледово олио",
  //       "сол, черен пипер",
  //       "червен пипер"
  //     ],
  //     "kg_token": "EiYKJE11c2FrYSBzIGthcnRvZmVuaSBwYWdvbmk..."
  //   }
  // }

  // --- Match at both stores in parallel ---
  console.log('Matching ingredients at ebag.bg and bulmag.org in parallel…\n');
  const [ebagData, bulmagData] = await Promise.all([
    matchToStore(recipe.kg_token, 'ebag.bg'),
    matchToStore(recipe.kg_token, 'bulmag.org'),
  ]);

  // Response shape: { items: [{ item_name, products: [{ product: { product_name, price: { price } }, session_token }] }], currency }

  const ebagMap   = buildPriceMap(ebagData);
  const bulmagMap = buildPriceMap(bulmagData);

  // --- Comparison table ---
  const allKeys = new Set([...Object.keys(ebagMap), ...Object.keys(bulmagMap)]);

  let ebagTotal   = 0;
  let bulmagTotal = 0;
  let ebagWins    = 0;
  let bulmagWins  = 0;
  let ties        = 0;

  console.log('══════════════════════════════════════════════════════════════════════════════════');
  console.log('  eBag vs Bulmag — ' + recipe.title);
  console.log('══════════════════════════════════════════════════════════════════════════════════\n');
  console.log(`  ${'Ingredient'.padEnd(30)} ${'eBag product (bg)'.padEnd(35)} ${'eBag €'.padStart(8)} ${'Bulmag product (bg)'.padEnd(35)} ${'Bulmag €'.padStart(9)} ${'Winner'.padStart(8)}`);
  console.log(`  ${'-'.repeat(30)} ${'-'.repeat(35)} ${'-'.repeat(8)} ${'-'.repeat(35)} ${'-'.repeat(9)} ${'-'.repeat(8)}`);

  for (const key of allKeys) {
    const ebag   = ebagMap[key];
    const bulmag = bulmagMap[key];

    const ebagPrice   = ebag?.price   ?? null;
    const bulmagPrice = bulmag?.price ?? null;

    const ebagFmt   = ebagPrice   !== null ? (ebagPrice / 100).toFixed(2)   : '—';
    const bulmagFmt = bulmagPrice !== null ? (bulmagPrice / 100).toFixed(2) : '—';

    let winner = '—';
    if (ebagPrice !== null && bulmagPrice !== null) {
      if (ebagPrice < bulmagPrice)      { winner = 'eBag';   ebagWins++;   }
      else if (bulmagPrice < ebagPrice) { winner = 'Bulmag'; bulmagWins++; }
      else                              { winner = 'tie';    ties++;       }
    }

    if (ebagPrice   !== null) ebagTotal   += ebagPrice;
    if (bulmagPrice !== null) bulmagTotal += bulmagPrice;

    const ingredient = (ebag?.ingredient ?? bulmag?.ingredient ?? key).slice(0, 28);
    const ebagName   = (ebag?.name   ?? '—').slice(0, 33);
    const bulmagName = (bulmag?.name ?? '—').slice(0, 33);

    console.log(`  ${ingredient.padEnd(30)} ${ebagName.padEnd(35)} ${ebagFmt.padStart(8)} ${bulmagName.padEnd(35)} ${bulmagFmt.padStart(9)} ${winner.padStart(8)}`);
  }

  console.log(`\n  ${'TOTAL BASKET'.padEnd(30)} ${''.padEnd(35)} ${((ebagTotal / 100).toFixed(2) + ' €').padStart(8)} ${''.padEnd(35)} ${((bulmagTotal / 100).toFixed(2) + ' €').padStart(9)}`);

  const overallWinner = ebagTotal < bulmagTotal ? 'eBag' : bulmagTotal < ebagTotal ? 'Bulmag' : 'Tie';
  const saving = Math.abs(ebagTotal - bulmagTotal);

  console.log('\n══════════════════════════════════════════════════════════════════════════════════');
  console.log(`  Scorecard: eBag wins ${ebagWins} items | Bulmag wins ${bulmagWins} items | ${ties} ties`);
  console.log(`  Overall winner: ${overallWinner} — saves ${(saving / 100).toFixed(2)} EUR on this basket`);
  console.log('══════════════════════════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
