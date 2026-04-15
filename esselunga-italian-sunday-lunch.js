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

async function parseRecipe(url) {
  console.log(`Parsing recipe: ${url}`);
  const res = await fetch(`${BASE_URL}/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipe_url: url, locale: 'it-IT' }),
  });
  if (!res.ok) throw new Error(`/parse failed: ${res.status}`);
  return res.json();
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
  const parseData = await parseRecipe(RECIPE_URL);
  const recipe = parseData.recipe;

  console.log(`\nRecipe: "${recipe.title}"`);
  console.log(`Ingredients (${recipe.ingredients.length}):\n`);
  recipe.ingredients.forEach(ing => console.log(`  • ${ing}`));

  if (recipe.nutrition) {
    console.log('\nNutrition per recipe:');
    console.log(`  Calories:      ${recipe.nutrition.calories} kcal`);
    console.log(`  Protein:       ${recipe.nutrition.protein_grams}g`);
    console.log(`  Carbohydrates: ${recipe.nutrition.carbohydrates_grams}g`);
    console.log(`  Fat:           ${recipe.nutrition.fat_grams}g`);
  }

  // Step 2 — get Esselunga products
  const productsData = await getEsselungaProducts(recipe.kg_token);

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
    const perUnit  = best.product.price_per_measure_unit || '';
    const bio      = best.product.classification?.is_bio ? ' [BIO]' : '';
    const it_name  = best.product.product_name_it ? ` / ${best.product.product_name_it}` : '';
    console.log(`  ${item.item_name.padEnd(28)} → ${best.product.product_name}${it_name}${bio} ${priceStr}`);
  });

  console.log(`\nTotal: ${formatPrice(totalCents)} for ${sessionTokens.length} items`);
  console.log('\nSession tokens collected. Pass them to /api/session to check out at Esselunga.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
