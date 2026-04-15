/**
 * Pepesto API Example — Danish meal prep: 5 lunches, one Nemlig order
 * Supermarket: Nemlig (nemlig.com)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/nemlig/
 * Docs: https://pepesto.com/api
 *
 * Run: node nemlig-dk-meal-prep-five-lunches.js
 * Requires: PEPESTO_API_KEY env var
 */

const BASE_URL = 'https://s.pepesto.com/api';
const API_KEY  = process.env.PEPESTO_API_KEY;

if (!API_KEY) {
  console.error('Set PEPESTO_API_KEY before running.');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`,
};

async function suggestLunches() {
  console.log('Searching for healthy lunch meal prep recipes...');
  const response = await fetch(`${BASE_URL}/suggest`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: 'healthy lunch meal prep make ahead',
      num_to_fetch: 5,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`/suggest failed: ${response.status} ${text}`);
  }

  const data = JSON.parse(text);

  return data;
}

async function getNemligProducts(kgTokens) {
  console.log(`\nFetching Nemlig products for ${kgTokens.length} recipes...`);
  const res = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_kg_tokens: kgTokens,
      supermarket_domain: 'nemlig.com',
    }),
  });
  if (!res.ok) throw new Error(`/products failed: ${res.status}`);
  return res.json();
}

async function createSession(skus) {
  console.log('\nCreating Nemlig checkout session...');
  const res = await fetch(`${BASE_URL}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ supermarket_domain: 'nemlig.com', skus }),
  });
  if (!res.ok) throw new Error(`/session failed: ${res.status}`);
  return res.json();
}

function formatDKK(ore) {
  // Nemlig prices in øre (1/100 DKK)
  return `${(ore / 100).toFixed(2)} kr`;
}

async function main() {
  // Step 1 — suggest 5 lunch recipes
  const suggestData = await suggestLunches();
  const recipes = suggestData.recipes;

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  console.log(`\nThis week's meal prep lineup (${recipes.length} lunches):\n`);
  recipes.forEach((r, i) => {
    const cal = r.nutrition?.calories || '?';
    console.log(`  ${days[i]}: ${r.title} (~${cal} kcal total)`);
  });

  // Step 2 — get Nemlig products for all recipes at once
  const kgTokens = recipes.map(r => r.kg_token);
  const productsData = await getNemligProducts(kgTokens);

  // Step 3 — pick best product per item
  const skus = [];
  let totalOre = 0;

  console.log('\n--- Nemlig shopping basket ---\n');

  productsData.items.forEach(item => {
    if (!item.products || item.products.length === 0) {
      console.log(`  [NOT FOUND] ${item.item_name}`);
      return;
    }
    // Prefer non-promo baseline price for accurate budgeting
    const best = item.products[0];
    skus.push({ session_token: best.session_token, num_units_to_buy: best.num_units_to_buy || 1 });
    totalOre += best.product.price.price * (best.num_units_to_buy || 1);

    const priceStr = formatDKK(best.product.price.price);
    const promoTag = best.product.price.promotion?.promo ? ' [TILBUD]' : '';
    const name     = best.product.product_name;
    console.log(`  ${item.item_name.padEnd(28)} → ${name} (${priceStr})${promoTag}`);
  });

  console.log(`\nBasket: ${skus.length} items | Estimated total: ${formatDKK(totalOre)}`);

  // Step 4 — create checkout session
  const session = await createSession(skus);

  console.log('\n--- Nemlig checkout ---');
  console.log(`Session ID:   ${session.session_id}`);
  console.log('\nPass the session_id to /checkout to get your Nemlig order link. Delivery usually same day if ordered before 13:00.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
