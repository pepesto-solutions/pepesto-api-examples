/**
 * Pepesto API Example — Belgian Supermarket Showdown: Colruyt vs Delhaize
 * Supermarket: Colruyt (colruyt.be) vs Delhaize (delhaize.be)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/colruyt/
 * Docs: https://pepesto.com/api
 *
 * Run: node colruyt-vs-delhaize-belgium-comparison.js
 * Requires: PEPESTO_API_KEY env var
 */

const API_BASE = 'https://s.pepesto.com/api';
const API_KEY = process.env.PEPESTO_API_KEY;

if (!API_KEY) {
  console.error('Error: PEPESTO_API_KEY environment variable is not set.');
  console.error('Get your API key at https://www.pepesto.com/ai-grocery-shopping-agent/#setup-authentication');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`,
};

// The basket both chains have to price. Generic names on purpose: /products
// resolves each one to whatever that chain actually stocks, which is what makes
// the two sides comparable. Keep it to 30 items — that is what /parse accepts
// in one shopping list.
// #region price-basket
const BASKET = [
  'ground pork', 'beef', 'chicken', 'sausage', 'bacon',
  'milk', 'butter', 'cheese', 'eggs', 'yoghurt', 'mozzarella cheese',
  'tomatoes', 'carrots', 'onions', 'potatoes', 'mushrooms', 'apples',
  'canned tomatoes', 'chickpeas',
  'beer', 'orange juice', 'sparkling water', 'coffee',
  'spaghetti', 'rice', 'flour', 'sugar', 'olive oil', 'salt', 'bread',
];

/**
 * Turns the shopping list into a kg_token. Sending the same token to both
 * chains is what lets the two baskets line up item by item.
 */
async function parseBasket() {
  console.log(`Parsing a ${BASKET.length}-item basket...`);
  const response = await fetch(`${API_BASE}/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipe_text: BASKET.join('\n') }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pepesto API error — ${response.status}: ${errorText}`);
  }

  const { kg_token } = await response.json();
  return kg_token;
}

/**
 * Prices the basket at one chain.
 */
async function priceBasketAt(kgToken, domain) {
  console.log(`Pricing the basket at ${domain}...`);
  const response = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipe_kg_tokens: [kgToken], supermarket_domain: domain }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pepesto API error for ${domain} — ${response.status}: ${errorText}`);
  }

  return response.json();
}
// #endregion

/**
 * Groups item names into Belgian grocery categories.
 */
function categorise(entityName) {
  const meat = ['Ground pork', 'Beef', 'Lamb chops', 'Ham', 'Chicken', 'Sausage', 'Bacon', 'Minced beef', 'Salami', 'Pork'];
  const dairy = ['Milk', 'Butter', 'Cheese', 'Eggs', 'Cream', 'Yoghurt', 'Mozzarella cheese', 'Fresh cheese'];
  const produce = ['Tomatoes', 'Carrots', 'Onions', 'Garlic', 'Lettuce', 'Potatoes', 'Mushrooms', 'Radishes', 'Spinach', 'Apples', 'Pears'];
  const canned = ['Canned pineapple', 'Canned tomatoes', 'Chickpeas', 'Peaches', 'Canned corn', 'Dried tomatoes'];
  const drinks = ['Beer', 'Wine', 'Juice', 'Water', 'Soda', 'Coffee', 'Tea'];
  const pantry = ['Pasta', 'Spaghetti', 'Rice', 'Flour', 'Sugar', 'Olive oil', 'Sunflower oil', 'Salt', 'Bread'];

  if (meat.includes(entityName)) return 'Meat & charcuterie';
  if (dairy.includes(entityName)) return 'Dairy & eggs';
  if (produce.includes(entityName)) return 'Fruit & vegetables';
  if (canned.includes(entityName)) return 'Canned & preserved';
  if (drinks.includes(entityName)) return 'Drinks';
  if (pantry.includes(entityName)) return 'Pantry staples';
  return 'Other';
}

/**
 * Builds an item→cheapest-product index from a /products response. Each item
 * comes back with several candidate products; the cheapest one is what the two
 * chains get compared on.
 */
// #region build-index
function buildEntityIndex(productsData) {
  const index = {};

  for (const item of productsData.items ?? []) {
    const cheapest = (item.products ?? [])
      .filter(p => typeof p.product?.price?.price === 'number')
      .sort((a, b) => a.product.price.price - b.product.price.price)[0];
    if (!cheapest) continue;

    index[item.item_name] = {
      name: cheapest.product.product_name || item.item_name,
      price: cheapest.product.price.price,
      currency: productsData.currency || 'EUR',
      promo: cheapest.product.price.promotion?.promo || false,
      url: cheapest.product.product_id || '',
    };
  }

  return index;
}
// #endregion

/**
 * Matches items present in both stores and compares prices.
 */
// #region compare-stores
function compareStores(colruytIndex, delhaizeIndex) {
  const matches = [];

  for (const entity of Object.keys(colruytIndex)) {
    if (!delhaizeIndex[entity]) continue;

    const colruyt = colruytIndex[entity];
    const delhaize = delhaizeIndex[entity];
    const diffCents = colruyt.price - delhaize.price;
    const diffPct = ((colruyt.price - delhaize.price) / delhaize.price) * 100;

    matches.push({
      entity,
      category: categorise(entity),
      colruyt: { name: colruyt.name, price: colruyt.price, promo: colruyt.promo },
      delhaize: { name: delhaize.name, price: delhaize.price, promo: delhaize.promo },
      diffCents,
      diffPct: diffPct.toFixed(1),
      winner: diffCents < 0 ? 'Colruyt' : diffCents > 0 ? 'Delhaize' : 'tie',
    });
  }

  matches.sort((a, b) => Math.abs(b.diffCents) - Math.abs(a.diffCents));
  return matches;
}
// #endregion

/**
 * Calculates a category-level scorecard.
 */
function categoryScorecard(matches) {
  const cards = {};

  for (const m of matches) {
    if (!cards[m.category]) {
      cards[m.category] = { Colruyt: 0, Delhaize: 0, tie: 0, total: 0 };
    }
    cards[m.category][m.winner]++;
    cards[m.category].total++;
  }

  return cards;
}

function fmt(cents) {
  return `€${(cents / 100).toFixed(2)}`;
}

async function main() {
  console.log('=== Colruyt vs Delhaize — Belgian Grocery Price Showdown ===\n');

  const kgToken = await parseBasket();

  console.log('Pricing the same basket at both chains in parallel...\n');
  const [colruytData, delhaizeData] = await Promise.all([
    priceBasketAt(kgToken, 'colruyt.be'),
    priceBasketAt(kgToken, 'delhaize.be'),
  ]);

  const colruytIndex = buildEntityIndex(colruytData);
  const delhaizeIndex = buildEntityIndex(delhaizeData);

  console.log(`Colruyt priced up ${Object.keys(colruytIndex).length} of the ${BASKET.length} items`);
  console.log(`Delhaize priced up ${Object.keys(delhaizeIndex).length} of the ${BASKET.length} items\n`);

  const matches = compareStores(colruytIndex, delhaizeIndex);
  console.log(`Matched ${matches.length} items between the two stores.\n`);

  // Top 15 biggest differences
  console.log('=== Biggest price differences ===\n');
  console.log(`${'Product'.padEnd(30)} ${'Colruyt'.padEnd(12)} ${'Delhaize'.padEnd(12)} ${'Diff'.padEnd(8)} Winner`);
  console.log('─'.repeat(80));

  for (const m of matches.slice(0, 15)) {
    const col = fmt(m.colruyt.price);
    const del = fmt(m.delhaize.price);
    const diff = `${m.diffPct > 0 ? '+' : ''}${m.diffPct}%`;
    const winner = m.winner === 'Colruyt' ? '← Colruyt' : m.winner === 'Delhaize' ? '← Delhaize' : 'tie';
    console.log(`${m.entity.padEnd(30)} ${col.padEnd(12)} ${del.padEnd(12)} ${diff.padEnd(8)} ${winner}`);
  }

  // Category scorecard
  const scorecard = categoryScorecard(matches);
  console.log('\n=== Category scorecard ===\n');
  console.log(`${'Category'.padEnd(28)} ${'Colruyt wins'.padEnd(16)} ${'Delhaize wins'.padEnd(16)} ${'Total items'}`);
  console.log('─'.repeat(72));

  let totalColruyt = 0, totalDelhaize = 0;
  for (const [cat, scores] of Object.entries(scorecard)) {
    console.log(
      `${cat.padEnd(28)} ${String(scores.Colruyt).padEnd(16)} ${String(scores.Delhaize).padEnd(16)} ${scores.total}`
    );
    totalColruyt += scores.Colruyt;
    totalDelhaize += scores.Delhaize;
  }

  // Verdict
  const total = totalColruyt + totalDelhaize;
  const colruytPct = ((totalColruyt / total) * 100).toFixed(0);
  console.log('\n=== Verdict ===\n');
  console.log(`Colruyt cheaper:  ${colruytPct}% of matched items`);
  console.log(`Delhaize cheaper: ${(100 - parseInt(colruytPct))}% of matched items\n`);

  if (totalColruyt > totalDelhaize) {
    console.log('Colruyt wins overall — consistent with its reputation as Belgium\'s');
    console.log('price leader. But Delhaize competes on specific categories (ready meals,');
    console.log('premium produce) and is more conveniently located in city centres.');
  } else {
    console.log('Delhaize edges ahead in this snapshot — though results vary week to week');
    console.log('depending on which store currently has the most promotions running.');
  }

  console.log('\nRun this weekly to track how the gap changes over time.');
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
