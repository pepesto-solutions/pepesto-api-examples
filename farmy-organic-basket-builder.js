/**
 * Pepesto API Example — Organic Basket Builder for a Week
 * Supermarket: Farmy CH (farmy.ch)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/farmy/
 * Docs: https://pepesto.com/api
 *
 * Run: node farmy-organic-basket-builder.js
 * Requires: PEPESTO_API_KEY env var
 */

const API_BASE = 'https://s.pepesto.com/api';
const API_KEY = process.env.PEPESTO_API_KEY;

if (!API_KEY) {
  console.error('Error: PEPESTO_API_KEY environment variable is not set.');
  console.error('Get your API key at https://www.pepesto.com/ai-grocery-shopping-agent/#setup-authentication');
  process.exit(1);
}

/**
 * Calls /api/suggest to find recipes matching a query.
 * Returns up to `limit` recipes, each with a kg_token.
 *
 * @param {string} query - Natural language recipe search
 * @param {number} limit - Max number of recipes to return
 */
async function suggestRecipes(query, limit = 5) {
  const response = await fetch(`${API_BASE}/suggest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ query, num_to_fetch: limit }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pepesto /suggest error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.recipes.slice(0, limit);
}

/**
 * Calls /api/products with one or more kg_tokens for a given supermarket.
 * Returns the matched SKUs with prices.
 *
 * @param {string[]} kgTokens       - Array of kg_tokens from /suggest or /parse
 * @param {string}  supermarketDomain
 */
async function fetchProducts(kgTokens, supermarketDomain) {
  const response = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      recipe_kg_tokens: kgTokens,
      supermarket_domain: supermarketDomain,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pepesto /products error ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function main() {
  console.log('=== Farmy CH — Organic Weekly Basket Builder ===\n');

  // Step 1: Suggest 5 healthy organic dinner recipes
  console.log('Step 1: Searching for healthy organic dinner recipes...\n');
  const recipes = await suggestRecipes('healthy organic dinner for two', 5);
  console.log(`Found ${recipes.length} recipes:\n`);
  for (const r of recipes) {
    console.log(`  • ${r.title}`);
  }
  console.log('');

  // Step 2: Fetch Farmy products for all recipes at once
  console.log('Step 2: Pricing all recipes at Farmy CH...\n');
  const kgTokens = recipes.map(r => r.kg_token);
  const productsData = await fetchProducts(kgTokens, 'farmy.ch');

  // Step 3: Print the merged basket.
  // /products merges items across all recipes — items[] is a flat list of ingredients.
  // Response shape: { items: [{ item_name, products: [{ product: IndexedProduct }] }], currency }
  const items = productsData.items ?? [];

  if (items.length === 0) {
    console.log('No Farmy matches found.\n');
    return;
  }

  console.log('Farmy products for the week:\n');
  let grandTotalCents = 0;

  for (const item of items) {
    if (!item.products?.length) continue;
    const p = item.products[0].product; // sorted best-first by API
    const price = p.price?.price ?? 0;
    const isBio = p.tags?.includes('bio') || p.tags?.includes('organic');
    const qty = p.quantity?.grams ? `${p.quantity.grams}g`
              : p.quantity?.milliliters ? `${p.quantity.milliliters}ml`
              : p.quantity?.pieces ? `${p.quantity.pieces}pc`
              : '';
    const bioTag = isBio ? ' [bio]' : '';
    console.log(`  • ${item.item_name.padEnd(30)} → ${(p.product_name || '').padEnd(40)} CHF ${(price / 100).toFixed(2).padStart(6)}  ${qty}${bioTag}`);
    grandTotalCents += price;
  }

  // Step 4: Weekly total
  console.log('\n=== Weekly basket estimate ===');
  console.log(`${items.length} ingredients at Farmy CH: CHF ${(grandTotalCents / 100).toFixed(2)}`);
  console.log(`(Covers ${recipes.length} dinners — items merged across recipes to minimise waste)`);
  console.log('\nNote: Farmy delivers farm-direct across Switzerland.');
  console.log('Bio products are marked [bio] above — these are certified organic.');
  console.log('\nGet your API key at https://pepesto.com/api');
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
