/**
 * Pepesto API Example — Irish dinner party: 3 courses, one Supervalu session
 * Supermarket: Supervalu IE (shop.supervalu.ie)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/supervalu/
 * Docs: https://pepesto.com/api
 *
 * Run: node supervalu-dinner-party-three-courses.js
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

// Three recipe URLs — starter, main, dessert
const RECIPES = [
  {
    label: 'Starter',
    url: 'https://www.bbcgoodfood.com/recipes/smoked-salmon-prawns-horseradish-cream-lime-vinaigrette',
  },
  {
    label: 'Main',
    url: 'https://www.bbcgoodfood.com/recipes/slow-cooker-beef-stew',
  },
  {
    label: 'Dessert',
    url: 'https://www.bbcgoodfood.com/recipes/easy-chocolate-mousse',
  },
];

async function parseRecipe(label, url) {
  console.log(`Parsing ${label}: ${url}`);
  const res = await fetch(`${BASE_URL}/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipe_url: url, locale: 'en-IE' }),
  });
  if (!res.ok) throw new Error(`/parse failed for ${label}: ${res.status}`);
  const data = await res.json();
  return { label, title: data.recipe.title, kg_token: data.recipe.kg_token, ingredients: data.recipe.ingredients };
}

async function getProducts(kgTokens) {
  console.log('\nFetching products from Supervalu for all 3 courses...');
  const res = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_kg_tokens: kgTokens,
      supermarket_domain: 'shop.supervalu.ie',
    }),
  });
  if (!res.ok) throw new Error(`/products failed: ${res.status}`);
  return res.json();
}

async function createSession(skus) {
  console.log('\nCreating Supervalu checkout session...');
  const res = await fetch(`${BASE_URL}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      supermarket_domain: 'shop.supervalu.ie',
      skus,
    }),
  });
  if (!res.ok) throw new Error(`/session failed: ${res.status}`);
  return res.json();
}

async function main() {
  // Step 1 — parse all three recipes (in parallel)
  const parsed = await Promise.all(RECIPES.map(r => parseRecipe(r.label, r.url)));

  console.log('\nParsed courses:');
  parsed.forEach(p => console.log(`  ${p.label}: "${p.title}" (${p.ingredients.length} ingredients)`));

  // Step 2 — get Supervalu products for all kg_tokens at once
  const kgTokens = parsed.map(p => p.kg_token);
  const productsData = await getProducts(kgTokens);

  // Step 3 — pick best product per item and build skus list for /session
  const skus = [];
  let totalCents = 0;

  console.log('\n--- Shopping basket ---\n');
  productsData.items.forEach(item => {
    const best = item.products[0];
    skus.push({ session_token: best.session_token, num_units_to_buy: best.num_units_to_buy || 1 });
    totalCents += best.product.price.price * (best.num_units_to_buy || 1);
    const priceStr = `€${(best.product.price.price / 100).toFixed(2)}`;
    console.log(`  ${item.item_name.padEnd(26)} → ${best.product.product_name} (${priceStr})`);
  });

  console.log(`\nBasket total: €${(totalCents / 100).toFixed(2)} across ${skus.length} items`);

  // Step 4 — create checkout session
  const session = await createSession(skus);

  console.log('\n--- Supervalu checkout session ---');
  console.log(`Session ID:   ${session.session_id}`);
  console.log('\nPass the session_id to the /checkout endpoint to get your basket URL.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
