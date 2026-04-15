/**
 * Pepesto API Example — Polish family shop auto-builder
 * Supermarket: Frisco (frisco.pl)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/frisco/
 * Docs: https://pepesto.com/api
 *
 * Run: node frisco-pl-family-shop-builder.js
 * Requires: PEPESTO_API_KEY env var
 *
 * Strategy:
 *   1. POST /api/parse on a traditional Polish bigos recipe URL
 *   2. POST /api/products at frisco.pl → matched Polish SKUs
 *   3. Print the full basket with real Polish product names
 *
 * The API handles Polish-language product matching automatically —
 * "kapusta kiszona" matches BELVITA Kapusta Kiszona, etc.
 */

const BASE_URL = 'https://s.pepesto.com/api';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.PEPESTO_API_KEY}`,
};

// Traditional Polish bigos (hunter's stew) recipe
const RECIPE_URL = 'https://www.kwestiasmaku.com/przepis/bigos';

// ─── Step 1: Parse the recipe ─────────────────────────────────────────────────

async function parseRecipe(url) {
  console.log(`Parsing recipe: ${url}\n`);

  const response = await fetch(`${BASE_URL}/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_url: url,
      locale: 'pl-PL',
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`POST /api/parse failed (${response.status}): ${text}`);
  }

  const data = JSON.parse(text);

  return data;
}

// ─── Step 2: Match to Frisco products ────────────────────────────────────────

async function matchToFrisco(kgToken) {
  console.log('Matching ingredients at frisco.pl…\n');

  const response = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_kg_tokens: [kgToken],
      supermarket_domain: 'frisco.pl',
    }),
  });

  if (!response.ok) {
    throw new Error(`/products failed: ${response.status} ${text}`);
  }

  const text = await response.text();

  const data = JSON.parse(text);

  return data;
}

// ─── Helper: print basket ────────────────────────────────────────────────────

function printBasket(recipe, productsData) {
  const items = productsData.items ?? [];
  let totalCents = 0;

  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Frisco Basket — ${recipe.title}`);
  console.log('══════════════════════════════════════════════════════════════\n');
  console.log(`  ${'Ingredient'.padEnd(35)} ${'Frisco product'.padEnd(45)} ${'Price'}`);
  console.log(`  ${'-'.repeat(35)} ${'-'.repeat(45)} ${'-'.repeat(10)}`);

  for (const item of items) {
    if (!item.products?.length) {
      console.log(`  [NOT FOUND] ${item.item_name}`);
      continue;
    }
    const best     = item.products[0];
    const name     = best.product.product_name ?? 'Unknown';
    const price    = best.product.price?.price ?? 0;
    const priceFmt = (price / 100).toFixed(2) + ' zł';
    totalCents += price * (best.num_units_to_buy || 1);
    const promoTag = best.product.price?.promotion?.promo ? ' [PROMO]' : '';

    console.log(`   ${item.item_name.padEnd(35)} ${(name + promoTag).padEnd(45)} ${priceFmt}`);
  }

  console.log(`\n  ${'TOTAL'.padEnd(80)} ${(totalCents / 100).toFixed(2)} zł\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.PEPESTO_API_KEY) {
    console.error('Error: PEPESTO_API_KEY env var is not set.');
    console.error('  export PEPESTO_API_KEY=pep_sk_your_key_here');
    process.exit(1);
  }

  // --- Parse ---
  const parseData = await parseRecipe(RECIPE_URL);
  const recipe    = parseData.recipe;

  console.log(`Recipe: "${recipe.title}"`);
  console.log(`Ingredients found: ${recipe.ingredients.length}`);
  console.log(`kg_token: ${recipe.kg_token.slice(0, 40)}…\n`);

  // Example parse response (so you can see the shape without an API key):
  //
  // {
  //   "recipe": {
  //     "title": "Bigos — Hunter's Stew",
  //     "ingredients": [
  //       "500g kapusta kiszona",
  //       "300g kapusta biała",
  //       "200g kiełbasa wędzona",
  //       "200g boczek wędzony",
  //       "200g wieprzowina",
  //       "30g suszone grzyby",
  //       "2 liście laurowe",
  //       "5 ziaren ziela angielskiego",
  //       "1 cebula",
  //       "sól, pieprz"
  //     ],
  //     "kg_token": "EiMKIUJpZ29zIC0tIEh1bnRlcidzIFN0ZXcJ..."
  //   }
  // }

  // --- Match ---
  const productsData = await matchToFrisco(recipe.kg_token);

  // Example products response snippet (frisco.pl real product names):
  //
  // {
  //   "items": [
  //     {
  //       "item_name": "500g kapusta kiszona",
  //       "products": [
  //         {
  //           "product": {
  //             "product_name": "Kapusta kiszona 1kg",
  //             "price": { "price": 449, "promotion": {} }
  //           },
  //           "session_token": "eyJwcm9kdWN0...",
  //           "num_units_to_buy": 1
  //         }
  //       ]
  //     },
  //     {
  //       "item_name": "200g kiełbasa wędzona",
  //       "products": [
  //         {
  //           "product": {
  //             "product_name": "FARMIO Kiełbasa śląska wieprzowa",
  //             "price": { "price": 1399, "promotion": {} }
  //           },
  //           "session_token": "eyJwcm9kdWN0...",
  //           "num_units_to_buy": 1
  //         }
  //       ]
  //     }
  //   ]
  // }

  // --- Print basket ---
  printBasket(recipe, productsData);

  // --- Session example ---
  console.log('// Ready to check out? Pass session_tokens from /products to POST /api/session:');
  console.log(JSON.stringify({
    endpoint: 'POST /api/session (example)',
    body: {
      supermarket_domain: 'frisco.pl',
      skus: [
        { session_token: 'eyJwcm9kdWN0...', num_units_to_buy: 1 },
        { session_token: 'eyJwcm9kdWN0...', num_units_to_buy: 1 },
      ],
    },
    response: {
      session_id: 'ses_frisco_def456',
    },
  }, null, 2));
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
