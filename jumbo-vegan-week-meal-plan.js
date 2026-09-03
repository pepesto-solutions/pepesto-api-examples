/**
 * Pepesto API Example — Vegan Week: 5 Dinners Auto-Planned at Jumbo
 * Supermarket: Jumbo (jumbo.com)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/jumbo/
 * Docs: https://pepesto.com/api
 *
 * Run: node jumbo-vegan-week-meal-plan.js
 * Requires: PEPESTO_API_KEY env var
 */

const API_BASE = 'https://s.pepesto.com/api';
const API_KEY = process.env.PEPESTO_API_KEY;

const DINNERS_PER_WEEK = 5;

if (!API_KEY) {
  console.error('Error: PEPESTO_API_KEY environment variable is not set.');
  console.error('Get your API key at https://www.pepesto.com/ai-grocery-shopping-agent/#setup-authentication');
  process.exit(1);
}

/**
 * Step 1: Search the Pepesto recipe database for vegan dinners.
 * Passing tags:["vegan"] ensures only vegan-tagged recipes are returned.
 *
 * @param {string} query
 * @param {string[]} tags
 * @param {number} limit
 * @returns {Promise<Array>}
 */
// #region suggest-vegan-dinners
// /suggest returns 3 recipes per call, so several queries are needed to fill a
// week. The same dish can come back from two queries — and even twice within a
// single call — with a different kg_token each time, so duplicates have to be
// dropped by title. Each query pulls on a different style of vegan dinner.
async function suggestVeganDinners(limit = 5) {
  const queries = [
    'vegan dinner with beans or lentils',
    'vegan pasta or noodle dinner',
    'vegan curry or stir fry dinner',
  ];

  const responses = await Promise.all(queries.map(async (query) => {
    const response = await fetch(`${API_BASE}/suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ query }),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`/suggest failed: ${response.status} ${text}`);
    }

    return JSON.parse(text);
  }));

  const seen = new Set();
  const recipes = [];
  for (const r of responses.flatMap(d => d.recipes)) {
    const key = r.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipes.push(r);
  }

  if (recipes.length < limit) {
    console.log(`Only ${recipes.length} distinct dinners came back — planning for those.`);
  }

  return recipes.slice(0, limit);
}
// #endregion

/**
 * Step 2: Fetch Jumbo products for a single recipe's kg_token.
 *
 * @param {string} kgToken
 * @returns {Promise<Array>} items array
 */
// #region fetch-jumbo-products
async function fetchJumboProducts(kgToken) {
  const response = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      recipe_kg_tokens: [kgToken],
      supermarket_domain: 'jumbo.com',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`/products failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.items;
}
// #endregion

/**
 * Calculate estimated cost for a recipe using the cheapest product
 * per ingredient.
 *
 * @param {Array} items
 * @returns {number} total in euro cents
 */
// #region estimate-cost
function estimateCost(items) {
  return items.reduce((total, item) => {
    if (!item.products || item.products.length === 0) return total;
    const prices = item.products.map(p => p.product.price.price).sort((a, b) => a - b);
    return total + prices[0];
  }, 0);
}
// #endregion

/**
 * Format euro cents as a EUR price string.
 * @param {number} cents
 * @returns {string}
 */
// #region format-eur
function formatEUR(cents) {
  return `€${(cents / 100).toFixed(2)}`;
}
// #endregion

/**
 * Print a formatted shopping list for one recipe.
 *
 * @param {string} title
 * @param {Array} items
 * @param {number} index - 1-based day number
 */
// #region print-meal-summary
function printMealSummary(title, items, index) {
  const costCents = estimateCost(items);
  const matchedCount = items.filter(i => i.products?.length > 0).length;

  console.log(`\n  Day ${index}: ${title}`);
  console.log(`  ${'─'.repeat(55)}`);
  console.log(`  Estimated cost at Jumbo: ${formatEUR(costCents)} (${matchedCount}/${items.length} items matched)\n`);

  items.forEach(item => {
    if (!item.products || item.products.length === 0) {
      console.log(`    • ${item.item_name.padEnd(32)} [no match found]`);
      return;
    }

    const top = item.products[0].product;
    const price = formatEUR(top.price.price);
    const promo = top.price.promotion?.promo ? ' [aanbieding]' : '';
    console.log(`    • ${item.item_name.padEnd(32)} ${top.product_name} — ${price}${promo}`);
  });
}
// #endregion

/**
 * Main: suggest 5 vegan dinners, look up Jumbo prices, print the week plan.
 */
// #region main
async function main() {
  console.log('Searching for vegan dinner recipes...\n');

  const recipes = await suggestVeganDinners(DINNERS_PER_WEEK);

  if (recipes.length === 0) {
    console.log('No vegan recipes returned. Try a different query.');
    return;
  }

  console.log(`Found ${recipes.length} vegan dinner ideas:\n`);
  recipes.forEach((r, i) => {
    console.log(`  Day ${i + 1}: ${r.title}`);
  });

  console.log('\nLooking up Jumbo prices for each recipe...');

  // Fetch products for all recipes in parallel
  const allItems = await Promise.all(recipes.map(r => fetchJumboProducts(r.kg_token)));

  console.log('\n' + '═'.repeat(60));
  console.log('  YOUR VEGAN WEEK — JUMBO SHOPPING PLAN');
  console.log('═'.repeat(60));

  let weeklyTotal = 0;

  recipes.forEach((recipe, i) => {
    const items = allItems[i];
    printMealSummary(recipe.title, items, i + 1);
    weeklyTotal += estimateCost(items);
  });

  console.log('\n' + '═'.repeat(60));
  console.log(`  Estimated weekly grocery bill at Jumbo: ${formatEUR(weeklyTotal)}`);
  console.log(`  Per meal (${recipes.length} dinners): ${formatEUR(Math.round(weeklyTotal / recipes.length))}`);
  console.log('═'.repeat(60));

  console.log('\nTip: call /api/session with supermarket_domain + skus (session_token + num_units_to_buy per item)');
  console.log('to create a Jumbo checkout session, then pass the session_id to /api/checkout for the basket link.');
  console.log('See: https://pepesto.com/api');
}
// #endregion

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
