/**
 * Pepesto API Example — Recipe Blog "Shop This" Button
 * Supermarket: Tesco (tesco.com)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/tesco/
 * Docs: https://pepesto.com/api
 *
 * Run: node tesco-recipe-to-cart-oneshot.js
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
 * Calls /api/oneshot with a recipe URL and optional extra text.
 * Returns a redirect_url that opens a pre-filled Tesco cart.
 *
 * @param {string} recipeUrl   - The recipe page URL to parse
 * @param {string} [extraText] - Optional free-text items to add alongside the recipe
 * @returns {Promise<string>}  - The redirect URL to the pre-filled Tesco cart
 */
async function buildTescoCart(recipeUrl, extraText = '') {
  const body = {
    content_urls: [recipeUrl],
    supermarket_domain: 'tesco.com',
  };

  // If the blogger wants to add extra items (e.g. "also add sparkling water"),
  // they can pass them as free text alongside the recipe URL.
  if (extraText) {
    body.content_text = extraText;
  }

  const response = await fetch(`${API_BASE}/oneshot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pepesto API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.redirect_url;
}

/**
 * Main demo: simulate what happens when a blog reader clicks
 * "Shop this recipe at Tesco" on a recipe post.
 */
async function main() {
  // This is the recipe URL on the blog post — in production,
  // this would come from the current page's URL or a data attribute.
  const recipeUrl = 'https://www.bbcgoodfood.com/recipes/pizza-margherita-4-easy-steps';

  // Optional: the blogger adds a note to always grab sparkling water and olive oil
  // no matter which recipe the reader is viewing.
  const extras = 'also add sparkling water and olive oil';

  console.log('Building Tesco cart for recipe:', recipeUrl);
  console.log('Extra items:', extras);
  console.log('Calling Pepesto /oneshot...\n');

  const cartUrl = await buildTescoCart(recipeUrl, extras);

  console.log('Cart ready! Redirect URL:');
  console.log(cartUrl);
  console.log('\nIn a browser, this would open the pre-filled Tesco checkout.');
  console.log('Your readers can review, adjust quantities, and pay — all at Tesco.');
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
