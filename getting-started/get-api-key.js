/**
 * get-api-key.js — Pepesto API: request a key and check your credits
 *
 * This script shows the two most common first steps when starting with
 * the Pepesto Grocery API:
 *
 *   1. POST /api/link  — request an API key with email address
 *   2. POST /api/credits — check how many API credits remain on the API key
 *
 * Run:
 *   export PEPESTO_EMAIL=you@example.com
 *   node getting-started/get-api-key.js
 *
 * After you receive the key (check your inbox), set it:
 *   export PEPESTO_API_KEY=pep_sk_your_key_here
 *
 * Docs: https://pepesto.com/api
 * No npm dependencies — uses Node.js built-in fetch (Node 18+).
 */

const BASE_URL = 'https://s.pepesto.com/api';

// ─── Step 1: Request an API key ───────────────────────────────────────────────

async function requestApiKey(email) {
  console.log(`\nRequesting API key for: ${email}`);

  const response = await fetch(`${BASE_URL}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST /api/link failed (${response.status}): ${text}`);
  }

  const data = await response.json();

  console.log('\n✓ Done, data contains now your api key.');
  console.log('\nOnce you have your key, run:');
  console.log('  export PEPESTO_API_KEY=pep_sk_your_key_here\n');

  return data;
}

// ─── Step 2: Check remaining credits ─────────────────────────────────────────

async function checkCredits(apiKey) {
  console.log('Checking credits for key:', apiKey.slice(0, 12) + '...');

  const response = await fetch(`${BASE_URL}/credits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST /api/credits failed (${response.status}): ${text}`);
  }

  const data = await response.json();

  console.log('\nCredits remaining:', data.credits_remaining ?? data.credits ?? '(see response)');
  console.log('Full response:', JSON.stringify(data, null, 2));

  return data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const email  = process.env.PEPESTO_EMAIL;
  const apiKey = process.env.PEPESTO_API_KEY;

  if (!email && !apiKey) {
    console.error('Error: set PEPESTO_EMAIL to request a key, or PEPESTO_API_KEY to check credits.');
    console.error('  export PEPESTO_EMAIL=you@example.com');
    process.exit(1);
  }

  try {
    // Request a key if we have an email but no key yet
    if (email && !apiKey) {
      await requestApiKey(email);
    }

    // Check credits once we have a key
    if (apiKey) {
      await checkCredits(apiKey);
    }
  } catch (err) {
    console.error('\nError:', err.message);
    process.exit(1);
  }
}

main();
