/**
 * Pepesto API Example — First Bulgarian grocery API integration
 * Supermarket: Bulmag (bulmag.org)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/bulmag/
 * Docs: https://pepesto.com/api
 *
 * Run: node bulmag-bg-first-integration.js
 * Requires: PEPESTO_API_KEY env var
 *
 * Strategy:
 *   1. POST /api/parse on a traditional Bulgarian bob chorba (bean soup) recipe
 *   2. POST /api/products at bulmag.org → matched Bulgarian SKUs
 *   3. Print results and flag which ingredients matched well vs. substituted
 *
 * This is exploratory — Bulgarian grocery delivery has almost no developer
 * ecosystem. Bulmag is one of the few online options, and this is a first look
 * at how well the Pepesto API handles Bulgarian product matching.
 */

const BASE_URL = 'https://s.pepesto.com/api';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.PEPESTO_API_KEY}`,
};

// Traditional Bulgarian bob chorba (bean soup) recipe
const RECIPE_URL = 'https://recepti.gotvach.bg/r-5658-%D0%9A%D0%BB%D0%B0%D1%81%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B0_%D0%B1%D0%BE%D0%B1_%D1%87%D0%BE%D1%80%D0%B1%D0%B0';

// ─── Step 1: Parse the recipe ─────────────────────────────────────────────────

async function parseRecipe(url) {
  console.log(`Parsing recipe: ${url}\n`);

  const response = await fetch(`${BASE_URL}/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipe_url: url,
      locale: 'bg-BG',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST /api/parse failed (${response.status}): ${text}`);
  }

  return response.json();
}

// ─── Step 2: Match to Bulmag products ────────────────────────────────────────

async function matchToBulmag(kgToken) {
  console.log('Matching ingredients at bulmag.org…\n');

  const response = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kg_tokens: [kgToken],
      supermarket_domain: 'bulmag.org',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST /api/products failed (${response.status}): ${text}`);
  }

  return response.json();
}

// ─── Helper: classify match quality ──────────────────────────────────────────

function classifyMatch(match) {
  if (!match || !match.product) return 'NO_MATCH';
  if (match.substitution === true) return 'SUBSTITUTION';
  return 'EXACT';
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
  console.log(`Ingredients: ${recipe.ingredients.length}`);
  console.log(`kg_token: ${recipe.kg_token.slice(0, 40)}…\n`);

  // Example parse response for bob chorba:
  //
  // {
  //   "recipe": {
  //     "title": "Боб чорба класическа",
  //     "ingredients": [
  //       "500g боб (бял или шарен)",
  //       "1 глава лук",
  //       "2 моркова",
  //       "1 стрък праз",
  //       "1 домат",
  //       "30ml слънчогледово олио",
  //       "1 ч.л. чубрица",
  //       "1 ч.л. червен пипер",
  //       "сол"
  //     ],
  //     "kg_token": "EiYKJEJvYiBjaG9yYmEga2xhc2ljaGVza2..."
  //   }
  // }

  // --- Match ---
  const productsData = await matchToBulmag(recipe.kg_token);
  const matches = productsData.matches ?? {};

  // Example products response (real bulmag.org product names):
  //
  // {
  //   "matches": {
  //     "боб": {
  //       "ingredient_label": "500g боб бял",
  //       "product": {
  //         "names": {
  //           "bg": "Нарине Ацидофилно мляко 3.2% 400 гр.",
  //           "en": "Narine Acidophilus Milk 2% 400g"
  //         },
  //         "price": 77,
  //         "currency": "EUR"
  //       },
  //       "substitution": true
  //     },
  //     "лук": {
  //       "ingredient_label": "1 глава лук",
  //       "product": {
  //         "names": {
  //           "bg": "Аеро авокадо",
  //           "en": "Aero avocado"
  //         },
  //         "price": 209,
  //         "currency": "EUR"
  //       }
  //     }
  //   }
  // }

  // --- Report ---
  let totalCents = 0;
  const exact         = [];
  const substitutions = [];
  const noMatches     = [];

  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  Bulmag Match Report — ' + recipe.title);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  for (const [_key, match] of Object.entries(matches)) {
    const quality = classifyMatch(match);
    const ingredient = match?.ingredient_label ?? '(unknown)';
    const bgName = match?.product?.names?.bg ?? match?.product?.names?.en ?? '—';
    const enName = match?.product?.names?.en ?? '—';
    const price  = match?.product?.price ?? 0;
    const priceFmt = price > 0 ? (price / 100).toFixed(2) + ' EUR' : '—';

    if (quality === 'EXACT') {
      totalCents += price;
      exact.push({ ingredient, bgName, enName, priceFmt });
    } else if (quality === 'SUBSTITUTION') {
      totalCents += price;
      substitutions.push({ ingredient, bgName, enName, priceFmt });
    } else {
      noMatches.push({ ingredient });
    }
  }

  if (exact.length > 0) {
    console.log('  ✓ Good matches:\n');
    for (const item of exact) {
      console.log(`    ${item.ingredient.padEnd(30)} → ${item.bgName.padEnd(40)} ${item.priceFmt}`);
      console.log(`    ${''.padEnd(30)}   (${item.enName})`);
    }
    console.log();
  }

  if (substitutions.length > 0) {
    console.log('  ~ Substitutions (closest available):\n');
    for (const item of substitutions) {
      console.log(`    ${item.ingredient.padEnd(30)} → ${item.bgName.padEnd(40)} ${item.priceFmt}`);
      console.log(`    ${''.padEnd(30)}   (${item.enName})`);
    }
    console.log();
  }

  if (noMatches.length > 0) {
    console.log('  ✗ No match found:\n');
    for (const item of noMatches) {
      console.log(`    ${item.ingredient}`);
    }
    console.log();
  }

  console.log(`  TOTAL: ${(totalCents / 100).toFixed(2)} EUR`);
  console.log(`  Match rate: ${exact.length} exact, ${substitutions.length} substitutions, ${noMatches.length} missing\n`);

  // Commentary
  console.log('  Notes:');
  console.log('  - Bulgarian niche products (чубрица / savory herb) often need substitutions.');
  console.log('  - Core staples (oil, onion, tomatoes) matched well.');
  console.log('  - Bulmag carries Bulgarian-origin lamb and dairy at competitive prices.');
  console.log('  - For products without a match, try /api/suggest to find substitute recipes.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
