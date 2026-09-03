/**
 * Pepesto API Example — Norwegian budget week — under 500 NOK
 * Supermarket: Meny (meny.no)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/meny/
 * Docs: https://pepesto.com/api
 *
 * Run: node meny-no-budget-week-500-nok.js
 * Requires: PEPESTO_API_KEY env var
 *
 * Strategy:
 *   1. POST /api/suggest → find 5 easy dinner recipes for 2
 *   2. POST /api/products for each recipe at meny.no → get matched SKUs + prices
 *   3. Total up the ingredient costs and check if it stays under 500 NOK
 */

const BASE_URL = 'https://s.pepesto.com/api';
const BUDGET_NOK_CENTS = 50000; // 500.00 NOK in øre

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.PEPESTO_API_KEY}`,
};

// ─── Step 1: Suggest 5 easy dinner recipes ───────────────────────────────────

// #region suggest-recipes
// /suggest returns 3 recipes per call, so several queries are needed to fill a
// week. The same dish can come back from two queries — and even twice within a
// single call — with a different kg_token each time, so duplicates have to be
// dropped by title. Each query pulls on a different main ingredient.
async function suggestRecipes(target = 5) {
  console.log('Searching for easy dinner recipes for 2…\n');

  const queries = [
    'easy dinner for 2 with chicken, few ingredients',
    'easy dinner for 2 with fish, few ingredients',
    'easy vegetarian dinner for 2, few ingredients',
  ];

  const responses = await Promise.all(queries.map(async (query) => {
    const response = await fetch(`${BASE_URL}/suggest`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`POST /api/suggest failed (${response.status}): ${text}`);
    }

    return response.json();
  }));

  const seen = new Set();
  const recipes = [];
  for (const recipe of responses.flatMap(d => d.recipes)) {
    const key = recipe.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipes.push(recipe);
  }

  if (recipes.length < target) {
    console.log(`Only ${recipes.length} distinct dinners came back — planning for those.`);
  }

  return recipes.slice(0, target);
}
// #endregion

// ─── Step 2: Match ingredients to Meny products ──────────────────────────────

// #region get-products-for-recipe
async function getProductsForRecipe(recipe) {
  const response = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_kg_tokens: [recipe.kg_token],
      supermarket_domain: 'meny.no',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST /api/products failed (${response.status}): ${text}`);
  }

  return response.json();
}
// #endregion

// ─── Helper: sum matched product prices (in øre) ─────────────────────────────

// #region sum-recipe-cost
function sumRecipeCost(productsResponse) {
  let totalCents = 0;
  const matched = [];

  for (const item of productsResponse.items ?? []) {
    if (!item.products?.length) continue;
    const p = item.products[0].product; // sorted best-first by API
    const price = p.price?.price ?? 0;
    totalCents += price;
    matched.push({
      ingredient: item.item_name,
      product: p.product_name ?? 'Unknown',
      price_nok: (price / 100).toFixed(2),
    });
  }

  return { totalCents, matched };
}
// #endregion

// ─── Main ─────────────────────────────────────────────────────────────────────

// #region main
async function main() {
  if (!process.env.PEPESTO_API_KEY) {
    console.error('Error: PEPESTO_API_KEY env var is not set.');
    console.error('  export PEPESTO_API_KEY=pep_sk_your_key_here');
    process.exit(1);
  }

  const recipes = await suggestRecipes();
  console.log(`Found ${recipes.length} recipes. Matching ingredients at meny.no…\n`);

  let grandTotalCents = 0;
  const results = [];

  for (const recipe of recipes) {
    process.stdout.write(`  • ${recipe.title} … `);
    const productsData = await getProductsForRecipe(recipe);
    const { totalCents, matched } = sumRecipeCost(productsData);
    grandTotalCents += totalCents;
    results.push({ title: recipe.title, totalCents, matched });
    console.log(`${(totalCents / 100).toFixed(2)} kr`);
  }

  // ─── Report ───────────────────────────────────────────────────────────────

  console.log('\n══════════════════════════════════════════');
  console.log('  5-Dinner Budget Summary — Meny.no');
  console.log('══════════════════════════════════════════\n');

  for (const r of results) {
    console.log(`${r.title}`);
    console.log(`  Cost: ${(r.totalCents / 100).toFixed(2)} kr`);
    for (const item of r.matched) {
      console.log(`    ${item.ingredient.padEnd(30)} → ${item.product.padEnd(40)} ${item.price_nok} kr`);
    }
    console.log();
  }

  const grandTotalNOK = (grandTotalCents / 100).toFixed(2);
  const underBudget   = grandTotalCents <= BUDGET_NOK_CENTS;

  console.log('══════════════════════════════════════════');
  console.log(`  TOTAL: ${grandTotalNOK} kr  /  Budget: 500.00 kr`);
  console.log(`  VERDICT: ${underBudget ? '✓ Under budget!' : '✗ Over budget by ' + ((grandTotalCents - BUDGET_NOK_CENTS) / 100).toFixed(2) + ' kr'}`);
  console.log('══════════════════════════════════════════\n');

  // Example of what a session call looks like once you pick SKUs:
  console.log('// To check out, pass session_tokens from /products to POST /api/session:');
  console.log(JSON.stringify({
    endpoint: 'POST /api/session (example)',
    body: {
      supermarket_domain: 'meny.no',
      skus: [{ session_token: 'eyJwcm9kdWN0...', num_units_to_buy: 1 }],
    },
    response_shape: {
      session_id: 'ses_meny_abc123',
    },
  }, null, 2));
}
// #endregion

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
