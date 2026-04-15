/**
 * Pepesto API Example — Building a "reorder my usual shop" script for Dunnes Stores
 * Supermarket: Dunnes Stores (dunnesstoresgrocery.com)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/dunnes/
 * Docs: https://pepesto.com/api
 *
 * Run: node dunnes-reorder-usual-shop.js
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

// My usual weekly shop — parsed as free text via /parse to get a kg_token
const USUAL_SHOP = [
  'semi-skimmed milk 2L',
  'free-range eggs 12 pack',
  'wholegrain bread 800g',
  'butter 250g',
  'cheddar cheese 400g',
  'Greek yogurt 500g',
  'chicken breast fillets 500g',
  'streaky bacon 200g',
  'salmon fillets 2 pack',
  'carrots 1kg',
  'baby potatoes 750g',
  'cherry tomatoes 250g',
  'cucumber',
  'broccoli',
  'spinach 200g',
  'pasta 500g',
  'tinned chopped tomatoes 400g',
  'orange juice 1L',
];

async function parseShoppingList() {
  console.log('Parsing usual shop list...');
  const response = await fetch(`${BASE_URL}/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_text: USUAL_SHOP.join('\n'),
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`/parse failed: ${response.status} ${text}`);
  }

  const data = JSON.parse(text);
  return data.recipe.kg_token;
}

async function getProducts(kgToken) {
  console.log(`Matching ${USUAL_SHOP.length} items at Dunnes Stores...`);
  const response = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_kg_tokens: [kgToken],
      supermarket_domain: 'dunnesstoresgrocery.com',
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`/products failed: ${response.status} ${text}`);
  }

  return JSON.parse(text);
}

async function createSession(skus) {
  console.log('\nCreating Dunnes Stores checkout session...');
  const res = await fetch(`${BASE_URL}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ supermarket_domain: 'dunnesstoresgrocery.com', skus }),
  });
  if (!res.ok) throw new Error(`/session failed: ${res.status}`);
  return res.json();
}

async function main() {
  // Step 1 — parse the free-text list into a kg_token
  const kgToken = await parseShoppingList();

  // Step 2 — match kg_token items to Dunnes products
  const productsData = await getProducts(kgToken);

  const skus = [];
  let totalCents = 0;
  let matchedCount = 0;
  let notFoundCount = 0;

  console.log('\n--- Matched items ---\n');

  productsData.items.forEach((item, i) => {
    const query = USUAL_SHOP[i] || item.item_name;
    if (!item.products || item.products.length === 0) {
      console.log(`  [NOT FOUND] ${query}`);
      notFoundCount++;
      return;
    }
    const best = item.products[0];
    skus.push({ session_token: best.session_token, num_units_to_buy: best.num_units_to_buy || 1 });
    totalCents += best.product.price.price * (best.num_units_to_buy || 1);
    matchedCount++;

    const priceStr = `€${(best.product.price.price / 100).toFixed(2)}`;
    const promoTag = best.product.price.promotion?.promo ? ' [PROMO]' : '';
    console.log(`  ${query.padEnd(35)} → ${best.product.product_name} (${priceStr})${promoTag}`);
  });

  console.log(`\nMatched ${matchedCount} of ${USUAL_SHOP.length} items.`);
  if (notFoundCount > 0) {
    console.log(`${notFoundCount} item(s) not found — check product names or try alternatives.`);
  }
  console.log(`Estimated total: €${(totalCents / 100).toFixed(2)}`);

  if (skus.length === 0) {
    console.log('No items to check out.');
    return;
  }

  // Step 3 — create checkout session
  const session = await createSession(skus);

  console.log('\n--- Dunnes Stores checkout ---');
  console.log(`Session ID:   ${session.session_id}`);
  console.log('\nPass the session_id to /checkout to get your Dunnes basket URL.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
