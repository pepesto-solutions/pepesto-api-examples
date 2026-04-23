/**
 * Pepesto API Example, parse a basket, return products from a supermarket
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/
 * Docs: https://www.pepesto.com/api
 *
 * Run: node defra-uk-parse-basket.js
 * Requires: PEPESTO_API_KEY env var
 */

import fs from 'fs';

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

const BASKET = [
  '4pt Skimmed Milk',
  '800g White Loaf',
  '400g Block of Cheddar Cheese'
];

const SUPERMARKETS = [
  'asda.com',
  'groceries.morrisons.com',
  'sainsburys.co.uk',
  'tesco.com',
  'waitrose.com'
]

async function parseShoppingBasket() {
  console.log('Parsing basket...');
  const response = await fetch(`${BASE_URL}/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_text: BASKET.join('\n'),
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`/parse failed: ${response.status} ${text}`);
  }

  const data = JSON.parse(text);

  console.log(data.recipe);
  console.log(data.recipe.kg_token);

  return data.recipe.kg_token;
}

async function getProducts(kgToken, supermarket) {
  console.log(`Matching ${BASKET.length} items at ${supermarket}...`);
  const response = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_kg_tokens: [kgToken],
      supermarket_domain: supermarket,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`/products failed: ${response.status} ${text}`);
  }

  const data = JSON.parse(text);

  console.log(`-------------------${supermarket}---------------------`);
  // console.log(data);
  console.log(JSON.stringify(data, null, 2));
  console.log(`-------------------${supermarket}---------------------`);

  return data;
}

async function main() {
  // Step 1 — parse the free-text list into a kg_token
  const kgToken = await parseShoppingBasket();

  // Step 2 — match kg_token items across all supermarkets
  const results = {}; // { supermarket: { productName: priceStr | 'X' } }

  for (const supermarket of SUPERMARKETS) {
    console.log(`\nFetching products from ${supermarket}...`);
    const productsData = await getProducts(kgToken, supermarket);
    results[supermarket] = {};

    productsData.items.forEach((item) => {
      const key = item.item_name; // ← use item_name as the canonical key
      if (!item.products || item.products.length === 0) {
        results[supermarket][key] = 'X';
      } else {
        const best = item.products[0];
        results[supermarket][key] = `£${(best.product.price.price / 100).toFixed(2)}`;
      }
    });
  }

  // Collect all item_name keys (from any supermarket's response)
  const itemNames = [...new Set(
    Object.values(results).flatMap(r => Object.keys(r))
  )];

  // Step 3 — export to CSV
  const header = ['Supermarket', ...itemNames].join(',');
  const rows = SUPERMARKETS.map(supermarket => {
    const cols = itemNames.map(name => results[supermarket]?.[name] ?? 'X');
    return [supermarket, ...cols].join(',');
  });

  const csv = [header, ...rows].join('\n');
  const filename = 'basket_comparison.csv';
  fs.writeFileSync(filename, csv, 'utf8');
  console.log(`\nCSV exported to ${filename}`);
  console.log('\n' + csv);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
