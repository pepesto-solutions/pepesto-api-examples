/**
 * Pepesto API Example — Weekly Meal Planner → One Shared Cart
 * Supermarket: Sainsbury's (sainsburys.co.uk)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/sainsburys/
 * Docs: https://pepesto.com/api
 *
 * Run: node sainsburys-weekly-meal-planner.js
 * Requires: PEPESTO_API_KEY env var
 */

const API_BASE = 'https://s.pepesto.com/api';
const API_KEY = process.env.PEPESTO_API_KEY;

if (!API_KEY) {
  console.error('Error: PEPESTO_API_KEY environment variable is not set.');
  console.error('Get your API key at https://www.pepesto.com/ai-grocery-shopping-agent/#setup-authentication');
  process.exit(1);
}

// This week's five dinner recipe URLs — swap these out each Sunday.
const RECIPE_URLS = [
  'https://www.bbcgoodfood.com/recipes/pizza-margherita-4-easy-steps',
  'https://www.bbcgoodfood.com/recipes/best-spaghetti-bolognese-recipe',
  'https://www.bbcgoodfood.com/recipes/chicken-tikka-masala',
  'https://www.bbcgoodfood.com/recipes/vegetable-curry-crowd',
  'https://www.bbcgoodfood.com/recipes/braised-beef-onepot',
];

/**
 * Step 1: Parse a single recipe URL to get structured ingredients and a kg_token.
 * The kg_token is a compact representation of the recipe's ingredient graph
 * that can be passed directly to /api/products.
 *
 * @param {string} recipeUrl
 * @returns {Promise<{title: string, kg_token: string}>}
 */
async function parseRecipe(recipeUrl) {
  const response = await fetch(`${API_BASE}/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      recipe_url: recipeUrl,
      locale: 'en-GB',
      generate_image: false,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`/parse failed for ${recipeUrl}: ${response.status} ${text}`);
  }

  const data = JSON.parse(text);

  const { title, kg_token } = data.recipe;
  return { title, kg_token };
}

/**
 * Step 2: Given all kg_tokens for the week, find matching Sainsbury's products
 * with prices. Returns a flat list of items with their top-ranked SKU.
 *
 * @param {string[]} kgTokens
 * @returns {Promise<Array>}
 */
async function fetchSainsburysProducts(kgTokens) {
  const response = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      recipe_kg_tokens: kgTokens,
      supermarket_domain: 'sainsburys.co.uk',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`/products failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.items;
}

/**
 * Step 3: Create a checkout session from the selected skus.
 * Returns a session_id — pass it to /checkout to get the basket URL.
 *
 * @param {{ session_token: string, num_units_to_buy: number }[]} skus
 * @returns {Promise<object>} - { session_id }
 */
async function createCheckoutSession(skus) {
  const response = await fetch(`${API_BASE}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      supermarket_domain: 'sainsburys.co.uk',
      skus,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`/session failed: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * Main: parse all five recipes in parallel, gather products, create one cart.
 */
async function main() {
  console.log(`Parsing ${RECIPE_URLS.length} recipes in parallel...\n`);

  // Parse all recipes concurrently — no reason to wait on each one sequentially.
  const parsedRecipes = await Promise.all(RECIPE_URLS.map(parseRecipe));

  parsedRecipes.forEach(({ title }, i) => {
    console.log(`  ${i + 1}. ${title}`);
  });

  const kgTokens = parsedRecipes.map(r => r.kg_token);

  console.log('\nFetching Sainsbury\'s products for all recipes...');
  const items = await fetchSainsburysProducts(kgTokens);

  console.log(`  Found ${items.length} ingredient lines across all recipes.\n`);

  // Pick the first (highest-ranked) product for each ingredient line.
  // In a real app you might show a picker UI or filter by promotions.
  const skus = items
    .filter(item => item.products && item.products.length > 0)
    .map(item => ({
      session_token: item.products[0].session_token,
      num_units_to_buy: item.products[0].num_units_to_buy || 1,
    }));

  // Print a shopping summary
  console.log('Shopping list (top match per ingredient):');
  items.forEach(item => {
    if (!item.products || item.products.length === 0) return;
    const top = item.products[0].product;
    const pence = top.price.price;
    const promo = top.price.promotion?.promo ? ' [ON OFFER]' : '';
    console.log(
      `  ${item.item_name.padEnd(30)} ${top.product_name.padEnd(45)} £${(pence / 100).toFixed(2)}${promo}`
    );
  });

  console.log(`\nCreating shared Sainsbury's checkout session for ${skus.length} items...`);
  const session = await createCheckoutSession(skus);

  console.log('\nSession created!');
  console.log(`  Session ID  : ${session.session_id}`);
  console.log('\nPass the session_id to /checkout to get the pre-filled cart URL.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
