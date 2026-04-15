/**
 * Pepesto API Example — Sunday Dinner to Cart in 90 Seconds
 * Supermarket: Coop CH (coop.ch)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/coop-ch/
 * Docs: https://pepesto.com/api
 *
 * Run: node coop-ch-sunday-dinner-oneshot.js
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
 * Calls /api/oneshot with a recipe URL and an optional extra shopping note.
 * Returns a redirect_url that opens a pre-filled Coop CH cart.
 *
 * @param {string} recipeUrl   - The recipe page to parse
 * @param {string} [extraText] - Optional free-text additions (e.g. "also add a bottle of red wine")
 * @returns {Promise<string>}  - The redirect URL to the pre-filled Coop checkout
 */
async function buildCoopCart(recipeUrl, extraText = '') {
  const body = {
    content_urls: [recipeUrl],
    supermarket_domain: 'coop.ch',
  };

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

async function main() {
  // A classic Swiss Sunday dinner: Zürcher Geschnetzeltes (Zurich-style veal strips
  // in cream sauce) from a popular Swiss food blog.
  const recipeUrl = 'https://www.swissmilk.ch/de/rezepte-kochideen/rezepte/LM201401_83/zuercher-geschnetzeltes/';

  // Add a few personal extras that aren't in the recipe itself
  const extras = 'also add a bottle of dry white wine and a sourdough bread';

  console.log('=== Coop CH Sunday Dinner — /oneshot demo ===\n');
  console.log('Recipe URL:', recipeUrl);
  console.log('Extras    :', extras);
  console.log('\nCalling Pepesto /api/oneshot...\n');

  const start = Date.now();
  const cartUrl = await buildCoopCart(recipeUrl, extras);
  const elapsed = Date.now() - start;

  console.log(`Done in ${elapsed}ms.\n`);
  console.log('Cart ready — redirect URL:');
  console.log(cartUrl);
  console.log('\n--- What happens next ---');
  console.log('Opening this URL takes you directly to coop.ch with all ingredients');
  console.log('already in your cart. Coop matched the recipe ingredients to real');
  console.log('SKUs: veal strips, cream, mushrooms, shallots, white wine, rösti.');
  console.log('You can adjust quantities or swap items before checkout.');
  console.log('\nTotal time from recipe URL to shopping cart: under 2 seconds.');
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
