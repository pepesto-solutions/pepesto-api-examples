/**
 * Pepesto API Example — Cheapest Possible Carbonara in Switzerland
 * Supermarket: Aldi CH (aldi-now.ch)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/aldi-ch/
 * Docs: https://pepesto.com/api
 *
 * Run: node aldi-ch-cheapest-carbonara.js
 * Requires: PEPESTO_API_KEY env var
 */

const API_BASE = 'https://s.pepesto.com/api';
const API_KEY = process.env.PEPESTO_API_KEY;

if (!API_KEY) {
  console.error('Error: PEPESTO_API_KEY environment variable is not set.');
  console.error('Get your API key at https://www.pepesto.com/ai-grocery-shopping-agent/#setup-authentication');
  process.exit(1);
}

// A classic carbonara recipe — we'll parse this URL to get structured ingredients.
// Serves 2 people.
const CARBONARA_RECIPE_URL = 'https://www.bbcgoodfood.com/recipes/ultimate-spaghetti-carbonara-recipe';

/**
 * Calls /api/parse to extract structured ingredients from a recipe URL.
 * Returns the recipe object including kg_token.
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
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pepesto /parse error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.recipe;
}

/**
 * Calls /api/products with a kg_token to find the cheapest Aldi CH matches.
 */
async function fetchAldiProducts(kgToken) {
  const response = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      recipe_kg_tokens: [kgToken],
      supermarket_domain: 'aldi-now.ch',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pepesto /products error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Extracts matched Aldi products from the /products response.
 * Response shape: { items: [{ item_name, products: [{ product: IndexedProduct }] }] }
 * products[] is sorted best-first by the API; we take [0] as the top pick.
 */
function pickCheapest(productsData) {
  return (productsData.items ?? [])
    .filter(item => item.products?.length)
    .map(item => ({ ingredient_label: item.item_name, ...item.products[0].product }));
}

async function main() {
  console.log('=== Aldi CH — Cheapest Carbonara Challenge ===\n');
  console.log('My friend claims carbonara for two costs under CHF 5 at Aldi.');
  console.log('Let\'s find out.\n');
  console.log('Recipe:', CARBONARA_RECIPE_URL);
  console.log('');

  // Step 1: Parse the recipe
  console.log('Step 1: Parsing recipe with /api/parse...\n');
  const recipe = await parseRecipe(CARBONARA_RECIPE_URL);

  console.log(`Recipe: "${recipe.title}"`);
  console.log('Ingredients:');
  for (const ing of recipe.ingredients) {
    console.log(`  - ${ing}`);
  }
  console.log('');

  // Step 2: Find cheapest Aldi products for each ingredient
  console.log('Step 2: Finding cheapest Aldi CH options with /api/products...\n');
  const productsData = await fetchAldiProducts(recipe.kg_token);
  const cheapestOptions = pickCheapest(productsData);

  if (cheapestOptions.length === 0) {
    console.log('No Aldi CH matches found. The store may not carry all items.');
    return;
  }

  // Step 3: Display the results
  console.log('=== Cheapest Aldi CH options for carbonara ===\n');

  let totalCents = 0;
  for (const product of cheapestOptions) {
    const name = product.product_name || '';
    const price = product.price?.price ?? 0;
    const qty = product.quantity?.grams ? `${product.quantity.grams}g`
              : product.quantity?.milliliters ? `${product.quantity.milliliters}ml`
              : product.quantity?.pieces ? `${product.quantity.pieces}pc`
              : '';
    totalCents += price;

    console.log(`${(product.ingredient_label || '').padEnd(25)} ${name.padEnd(45)} CHF ${(price / 100).toFixed(2).padStart(6)}  (${qty})`);
  }

  console.log('\n' + '─'.repeat(90));
  console.log(`Total basket:${''.padEnd(60)} CHF ${(totalCents / 100).toFixed(2)}`);

  // Step 4: The verdict
  const totalForTwo = totalCents / 100;
  const perServing = totalForTwo / 2;
  console.log('\n=== The verdict ===\n');
  console.log(`Full carbonara basket at Aldi CH: CHF ${totalForTwo.toFixed(2)}`);
  console.log(`Per serving (2 portions):         CHF ${perServing.toFixed(2)}`);

  if (totalForTwo < 5.0) {
    console.log('\nVerdict: He was right. Carbonara for two comes in under CHF 5 at Aldi.');
    console.log('Granted, you\'re buying full packs — the spaghetti and guanciale');
    console.log('will cover several meals. Cost-per-use is even lower.');
  } else if (totalForTwo < 8.0) {
    console.log('\nVerdict: Close, but not quite. The basket is under CHF 8 — still');
    console.log('excellent value for a proper carbonara with Pecorino and guanciale.');
    console.log('At CHF ' + perServing.toFixed(2) + ' per serving, no restaurant can compete.');
  } else {
    console.log('\nVerdict: Aldi is still great value, though pack sizes push the total');
    console.log('basket higher. You\'ll have leftovers for multiple carbonara nights.');
  }

  console.log('\nNote: prices are in CHF. aldi-now.ch delivers across Switzerland.');
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
