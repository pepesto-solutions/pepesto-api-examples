/**
 * Pepesto API Example — Keto week: 7 dinners, auto-carted at Delhaize
 * Supermarket: Delhaize (delhaize.be)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/delhaize/
 * Docs: https://pepesto.com/api
 *
 * Run: node delhaize-keto-week-meal-plan.js
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

// Step 1 — find 7 keto dinner recipes via /suggest
// #region suggest-keto-meals
// /suggest returns 3 recipes per call, so several queries are needed to fill a
// week. The same dish can come back from two queries — and even twice within a
// single call — with a different kg_token each time, so duplicates have to be
// dropped by title. Each query pulls on a different protein to spread the week.
async function suggestKetoMeals(target = 7) {
  console.log('Searching for keto dinner recipes...');
  const queries = [
    'Keto chicken dinner, low carb and high protein',
    'Keto beef or steak dinner, low carb and high protein',
    'Keto salmon or white fish dinner, low carb and high protein',
    'Keto pork or lamb dinner, low carb and high protein',
  ];

  const suggestions = await Promise.all(queries.map(async (query) => {
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
  const unique = [];
  for (const recipe of suggestions.flatMap((s) => s.recipes)) {
    const key = recipe.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(recipe);
  }

  if (unique.length < target) {
    console.log(`Only ${unique.length} distinct dinners came back — planning for those.`);
  }

  return unique.slice(0, target);
}
// #endregion

// Step 2 — resolve all recipe kg_tokens to Delhaize products
// #region get-delhaize-products
async function getDelhaizeProducts(kgTokens) {
  console.log(`Fetching Delhaize products for ${kgTokens.length} recipes...`);
  const res = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_kg_tokens: kgTokens,
      supermarket_domain: 'delhaize.be',
    }),
  });
  if (!res.ok) throw new Error(`/products failed: ${res.status}`);
  return res.json();
}
// #endregion

// #region format-price
function formatPrice(cents) {
  return `€${(cents / 100).toFixed(2)}`;
}
// #endregion

// #region main
async function main() {
  // --- Step 1: suggest ---
  const recipes = await suggestKetoMeals();

  console.log(`\nFound ${recipes.length} keto dinners for the week:\n`);
  recipes.forEach((r, i) => {
    const day = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i];
    console.log(`  ${day}: ${r.title}`);
  });

  // --- Step 2: products ---
  const kgTokens = recipes.map(r => r.kg_token);
  const productsData = await getDelhaizeProducts(kgTokens);

  // Map products back to recipes by index
  let grandTotal = 0;
  console.log('\n--- Weekly keto shopping list at Delhaize ---\n');

  recipes.forEach((recipe, i) => {
    const day = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i];
    console.log(`${day}: ${recipe.title}`);

    // The /products response groups items by ingredient across all tokens,
    // so split it into equal slices to attribute items back to each recipe.
    let mealTotal = 0;
    const mealItems = productsData.items.slice(
      i * Math.ceil(productsData.items.length / recipes.length),
      (i + 1) * Math.ceil(productsData.items.length / recipes.length)
    );

    mealItems.forEach(item => {
      const best = item.products[0];
      const priceStr = formatPrice(best.product.price.price);
      const sub = best.product.price.promotion?.promo ? ' [ON PROMO]' : '';
      const subst = item.substitution ? ' ⚑ substitution' : '';
      console.log(`  • ${item.item_name}: ${best.product.product_name} ${priceStr}${sub}${subst}`);
      mealTotal += best.product.price.price;
    });

    grandTotal += mealTotal;
    console.log(`  Meal subtotal: ${formatPrice(mealTotal)}\n`);
  });

  console.log(`Grand total for the week: ${formatPrice(grandTotal)}`);
  console.log('\nDone! Call /api/session with supermarket_domain + skus (session_token + num_units_to_buy per item), then pass the session_id to /api/checkout to create your Delhaize basket.');
}
// #endregion

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
