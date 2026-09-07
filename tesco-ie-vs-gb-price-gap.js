/**
 * Pepesto API Example — IE vs GB price gap: same products, different prices
 * Supermarket: Tesco IE (tesco.ie) vs Tesco GB (tesco.com)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/tesco-ie/
 * Docs: https://pepesto.com/api
 *
 * Run: node tesco-ie-vs-gb-price-gap.js
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

// The basket to price up on both sides of the Irish Sea. These are generic
// names on purpose: /products resolves each one to whatever the chain actually
// stocks, which is what makes the two sides comparable.
const BASKET = [
  'milk',
  'butter',
  'cheddar cheese',
  'eggs',
  'chicken breast',
  'minced beef',
  'spaghetti',
  'basmati rice',
  'tinned tomatoes',
  'olive oil',
  'potatoes',
  'onions',
  'carrots',
  'bananas',
  'apples',
  'orange juice',
  'white bread',
  'porridge oats',
  'tea bags',
  'coffee',
];

/**
 * Turns the shopping list into a kg_token. The token is Pepesto's reading of
 * what was asked for, so sending the same one to both chains is what lets the
 * two baskets line up item by item.
 */
async function parseBasket() {
  console.log(`Parsing a ${BASKET.length}-item basket...`);
  const res = await fetch(`${BASE_URL}/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipe_text: BASKET.join('\n') }),
  });
  if (!res.ok) throw new Error(`/parse failed: ${res.status}`);
  const { kg_token } = await res.json();
  return kg_token;
}

/** Prices the basket at one chain, as a map of item name → cheapest match. */
async function priceBasketAt(kgToken, domain) {
  console.log(`Pricing the basket at ${domain}...`);
  const res = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipe_kg_tokens: [kgToken], supermarket_domain: domain }),
  });
  if (!res.ok) throw new Error(`/products ${domain} failed: ${res.status}`);
  const data = await res.json();

  const prices = {};
  for (const item of data.items ?? []) {
    const cheapest = (item.products ?? [])
      .filter(p => typeof p.product?.price?.price === 'number')
      .sort((a, b) => a.product.price.price - b.product.price.price)[0];
    if (!cheapest) continue;

    prices[item.item_name] = {
      name: cheapest.product.product_name || 'Unnamed product',
      price: cheapest.product.price.price,
    };
  }
  return prices;
}

async function main() {
  const kgToken = await parseBasket();

  // Both chains price the same basket, in parallel.
  const [ie, gb] = await Promise.all([
    priceBasketAt(kgToken, 'tesco.ie'),
    priceBasketAt(kgToken, 'tesco.com'),
  ]);

  // Only items both chains matched can be compared.
  const shared = Object.keys(ie).filter(item => gb[item]);

  console.log(`\nComparing ${shared.length} items Tesco IE and Tesco GB both stock`);
  console.log('Note: prices shown in local currency (EUR for IE, GBP for GB).');
  console.log('EUR/GBP are approximately at parity for easy comparison.\n');

  const rows = shared.map(item => ({
    item,
    ieName:  ie[item].name,
    gbName:  gb[item].name,
    ieCents: ie[item].price,
    gbPence: gb[item].price,
    diff:    ie[item].price - gb[item].price, // negative = IE cheaper
  }));

  // Sort: biggest gap first
  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log('=== Top price differences ===\n');
  rows.slice(0, 20).forEach(r => {
    const ieStr  = `€${(r.ieCents / 100).toFixed(2)} (${r.ieName})`;
    const gbStr  = `£${(r.gbPence / 100).toFixed(2)} (${r.gbName})`;
    const winner = r.diff < 0 ? 'IE cheaper' : 'GB cheaper';
    const gap    = `${Math.abs(r.diff / 100).toFixed(2)}`;
    console.log(`${r.item.padEnd(28)} IE: ${ieStr.padEnd(46)} GB: ${gbStr.padEnd(46)} → ${winner} by ${gap}`);
  });

  // Summary stats
  const ieCheaper = rows.filter(r => r.diff < 0).length;
  const gbCheaper = rows.filter(r => r.diff > 0).length;

  console.log('\n=== Summary ===');
  console.log(`Items where IE is cheaper: ${ieCheaper}`);
  console.log(`Items where GB is cheaper: ${gbCheaper}`);
  console.log(`Items at the same price:   ${rows.length - ieCheaper - gbCheaper}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
