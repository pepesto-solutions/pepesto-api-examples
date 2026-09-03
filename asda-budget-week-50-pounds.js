/**
 * Pepesto API Example — Budget Week: Feeding 4 for £50 at ASDA
 * Supermarket: ASDA (asda.com)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/asda/
 * Docs: https://pepesto.com/api
 *
 * Run: node asda-budget-week-50-pounds.js
 * Requires: PEPESTO_API_KEY env var
 */

const API_BASE = 'https://s.pepesto.com/api';
const API_KEY = process.env.PEPESTO_API_KEY;

const BUDGET_PENCE = 5000; // £50.00
const MEALS_TARGET = 5;

if (!API_KEY) {
  console.error('Error: PEPESTO_API_KEY environment variable is not set.');
  console.error('Get your API key at https://www.pepesto.com/ai-grocery-shopping-agent/#setup-authentication');
  process.exit(1);
}

/**
 * Step 1: Search the Pepesto recipe database for cheap family dinners.
 * The /suggest endpoint returns matching recipes with kg_tokens ready for
 * product lookup — no recipe URL needed.
 *
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array<{title: string, kg_token: string, nutrition: object}>>}
 */
// #region suggest-recipes
// /suggest returns 3 recipes per call, so several queries are needed to fill a
// week. The same dish can come back from two queries — and even twice within a
// single call — with a different kg_token each time, so duplicates have to be
// dropped by title. Each query pulls on a different main ingredient.
async function suggestRecipes(limit = 5) {
  const queries = [
    'cheap family dinner with chicken, under 10 pounds',
    'cheap family dinner with beef mince, budget friendly',
    'cheap vegetarian family dinner, budget friendly',
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
    recipes.push({
      title: r.title,
      kg_token: r.kg_token,
      nutrition: r.nutrition,
      ingredients: r.ingredients,
    });
  }

  if (recipes.length < limit) {
    console.log(`Only ${recipes.length} distinct dinners came back — planning for those.`);
  }

  return recipes.slice(0, limit);
}
// #endregion

/**
 * Step 2: Look up ASDA prices for one recipe's kg_token.
 * Returns the items array with matched products and prices.
 *
 * @param {string} kgToken
 * @returns {Promise<Array>}
 */
// #region fetch-asda-products
async function fetchAsdaProducts(kgToken) {
  const response = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      recipe_kg_tokens: [kgToken],
      supermarket_domain: 'asda.com',
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
 * Calculate the estimated cost in pence for a set of matched items,
 * picking the cheapest available product for each ingredient.
 *
 * @param {Array} items
 * @returns {number} total cost in pence
 */
// #region cheapest-cost
function cheapestCost(items) {
  return items.reduce((total, item) => {
    if (!item.products || item.products.length === 0) return total;
    // Sort by price ascending to find the cheapest match
    const prices = item.products.map(p => p.product.price.price).sort((a, b) => a - b);
    return total + prices[0];
  }, 0);
}
// #endregion

/**
 * Main: suggest 5 budget meals, price them all at ASDA, tally up.
 */
// #region main
async function main() {
  console.log('Searching for budget family dinner ideas...\n');

  const recipes = await suggestRecipes(MEALS_TARGET);

  console.log(`Found ${recipes.length} meal suggestions:\n`);
  recipes.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.title}`);
    console.log(`     Calories: ~${r.nutrition.calories} kcal | Protein: ${r.nutrition.protein_grams}g`);
  });

  console.log('\nLooking up ASDA prices for each meal...\n');

  // Fetch products for all recipes in parallel
  const productResults = await Promise.all(recipes.map(r => fetchAsdaProducts(r.kg_token)));

  let grandTotal = 0;
  const mealSummaries = [];

  recipes.forEach((recipe, i) => {
    const items = productResults[i];
    const costPence = cheapestCost(items);
    grandTotal += costPence;

    const matchedCount = items.filter(item => item.products?.length > 0).length;

    mealSummaries.push({
      title: recipe.title,
      costPence,
      matchedItems: matchedCount,
      totalItems: items.length,
    });
  });

  console.log('Meal cost breakdown at ASDA (cheapest product per ingredient):\n');
  mealSummaries.forEach((meal, i) => {
    const costStr = `£${(meal.costPence / 100).toFixed(2)}`;
    const coverage = `${meal.matchedItems}/${meal.totalItems} ingredients matched`;
    console.log(`  ${i + 1}. ${meal.title}`);
    console.log(`     Est. cost: ${costStr.padEnd(8)} (${coverage})`);
  });

  const grandTotalStr = `£${(grandTotal / 100).toFixed(2)}`;
  const underBudget = grandTotal <= BUDGET_PENCE;

  console.log('\n' + '─'.repeat(60));
  console.log(`  5 dinners for 4 people — estimated total: ${grandTotalStr}`);
  console.log(`  Budget: £${(BUDGET_PENCE / 100).toFixed(2)}`);
  console.log(`  Result: ${underBudget ? '✓ Under budget!' : '✗ Over budget by £' + ((grandTotal - BUDGET_PENCE) / 100).toFixed(2)}`);
  console.log('─'.repeat(60));

  if (!underBudget) {
    console.log('\nTip: try filtering for meals with fewer than 8 ingredients,');
    console.log('or look for ASDA Smart Price and own-brand alternatives.');
  }
}
// #endregion

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
