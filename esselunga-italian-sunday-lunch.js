/**
 * Pepesto API Example — Italian Sunday lunch parsed from a food blog
 * Supermarket: Esselunga (spesaonline.esselunga.it)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/esselunga/
 * Docs: https://pepesto.com/api
 *
 * Run: node esselunga-italian-sunday-lunch.js
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

// The osso buco recipe URL from a popular Italian food blog
const RECIPE_URL = 'https://ricette.giallozafferano.it/Ossibuchi-alla-milanese.html';

/**
 * Parses a recipe URL and returns its kg_token, the compact representation of
 * the recipe's ingredients that /products takes. The `recipe` object alongside
 * it is deprecated and now carries nothing but the same token.
 */
async function parseRecipe(url) {
  console.log(`Parsing recipe: ${url}`);
  const res = await fetch(`${BASE_URL}/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipe_url: url, locale: 'it-IT' }),
  });
  if (!res.ok) throw new Error(`/parse failed: ${res.status}`);
  const { kg_token } = await res.json();
  return kg_token;
}

async function getEsselungaProducts(kgToken) {
  console.log('\nFetching Esselunga products...');
  const res = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_kg_tokens: [kgToken],
      supermarket_domain: 'spesaonline.esselunga.it',
    }),
  });
  if (!res.ok) throw new Error(`/products failed: ${res.status}`);
  return res.json();
}

function formatPrice(cents) {
  return `€${(cents / 100).toFixed(2)}`;
}

async function main() {
  // Step 1 — parse the recipe
  const kgToken = await parseRecipe(RECIPE_URL);

  // Step 2 — get Esselunga products
  const productsData = await getEsselungaProducts(kgToken);

  console.log('\n--- Esselunga shopping list ---\n');

  const sessionTokens = [];
  let totalCents = 0;

  productsData.items.forEach(item => {
    if (!item.products || item.products.length === 0) {
      console.log(`  [NOT FOUND] ${item.item_name}`);
      return;
    }
    const best = item.products[0];
    sessionTokens.push(best.session_token);
    totalCents += best.product.price.price;

    const priceStr = formatPrice(best.product.price.price);
    const bio      = best.product.classification?.is_bio ? ' [BIO]' : '';
    console.log(`  ${item.item_name.padEnd(28)} → ${best.product.product_name}${bio} ${priceStr}`);
  });

  console.log(`\nTotal: ${formatPrice(totalCents)} for ${sessionTokens.length} items`);
  console.log('\nSession tokens collected. Pass them to /api/session to check out at Esselunga.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
