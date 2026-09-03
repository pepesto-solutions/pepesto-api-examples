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

// #region suggest-lunches
// /suggest returns 3 recipes per call, so several queries are needed to fill a
// week. The same dish can come back from two queries — and even twice within a
// single call — with a different kg_token each time, so duplicates have to be
// dropped by title. Each query pulls on a different style of lunch.
async function suggestLunches(target = 5) {
  console.log('Searching for healthy lunch meal prep recipes...');
  const queries = [
    'healthy make ahead lunch with chicken',
    'healthy meal prep lunch with grains or salad',
    'healthy vegetarian meal prep lunch',
  ];

  const responses = await Promise.all(queries.map(async (query) => {
    const response = await fetch(`${BASE_URL}/suggest`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`/suggest failed: ${response.status} ${text}`);
    }

    return JSON.parse(text);
  }));

  const seen = new Set();
  const lunches = [];
  for (const recipe of responses.flatMap(d => d.recipes)) {
    const key = recipe.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lunches.push(recipe);
  }

  if (lunches.length < target) {
    console.log(`Only ${lunches.length} distinct lunches came back — planning for those.`);
  }

  return lunches.slice(0, target);
}
// #endregion

// #region get-nemlig-products
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
// #endregion

// #region build-skus
// One basket line per matched ingredient. /products orders each item's matches
// cheapest first, so the first entry is the one to buy.
function buildSkus(items) {
  return items
    .filter(item => item.products?.length > 0)
    .map(item => ({
      session_token: item.products[0].session_token,
      num_units_to_buy: item.products[0].num_units_to_buy || 1,
    }));
}
// #endregion

// #region create-session
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
// #endregion

// #region format-dkk
function formatDKK(ore) {
  // Nemlig prices in øre (1/100 DKK)
  return `${(ore / 100).toFixed(2)} kr`;
}
// #endregion

// #region main
async function main() {
  // Step 1 — suggest 5 lunch recipes
  const recipes = await suggestLunches();

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
  const skus = buildSkus(productsData.items);
  let totalOre = 0;

  console.log('\n--- Nemlig shopping basket ---\n');

  productsData.items.forEach(item => {
    if (!item.products || item.products.length === 0) {
      console.log(`  [NOT FOUND] ${item.item_name}`);
      return;
    }
    // Prefer non-promo baseline price for accurate budgeting
    const best = item.products[0];
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
// #endregion

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
