/**
 * Pepesto API Example — Telegram Grocery Bot for Morrisons
 * Supermarket: Morrisons (groceries.morrisons.com)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/morrisons/
 * Docs: https://pepesto.com/api
 *
 * Run: node morrisons-telegram-grocery-bot.js
 * Requires: PEPESTO_API_KEY env var
 *
 * Note: This file shows the core Pepesto logic around a simplified
 * Telegram webhook handler. In production you'd wire this into a
 * real Telegram Bot API server (e.g. using the `node-telegram-bot-api`
 * package or your own HTTP handler).
 */

const API_BASE = 'https://s.pepesto.com/api';
const API_KEY = process.env.PEPESTO_API_KEY;

if (!API_KEY) {
  console.error('Error: PEPESTO_API_KEY environment variable is not set.');
  console.error('Get your API key at https://www.pepesto.com/ai-grocery-shopping-agent/#setup-authentication');
  process.exit(1);
}

// Simple URL detection regex
const URL_REGEX = /https?:\/\/[^\s]+/i;

/**
 * Core function: given either a recipe URL or plain text grocery items,
 * call /api/oneshot and get back a Morrisons cart link.
 *
 * This is the function that does the real work — everything else is
 * Telegram plumbing.
 *
 * @param {object} options
 * @param {string[]} [options.contentUrls]  - recipe URL(s), if the user sent a link
 * @param {string}  [options.contentText]   - free text items, if the user typed a list
 * @returns {Promise<string>}               - the Morrisons cart redirect URL
 */
async function buildMorrisonsCart({ contentUrls = [], contentText = '' }) {
  const body = {
    supermarket_domain: 'groceries.morrisons.com',
  };

  if (contentUrls.length > 0) {
    body.content_urls = contentUrls;
  }

  if (contentText) {
    body.content_text = contentText;
  }

  const response = await fetch(`${API_BASE}/oneshot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pepesto /oneshot error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.redirect_url;
}

/**
 * Handles an incoming Telegram message from the household group.
 *
 * Two supported message types:
 *  1. A recipe URL  → ingredients are parsed automatically
 *  2. Plain text    → treated as a grocery item list
 *
 * In both cases, the bot replies with a Morrisons cart link.
 *
 * @param {object} message - simplified Telegram message object
 * @param {string} message.text
 * @param {string} message.from - sender display name
 * @param {Function} reply - async function(text) to send a reply to the chat
 */
async function handleTelegramMessage(message, reply) {
  const { text, from } = message;

  if (!text || text.trim().length === 0) {
    return; // ignore empty messages, stickers, etc.
  }

  const urlMatch = text.match(URL_REGEX);

  try {
    let cartUrl;

    if (urlMatch) {
      // Message contains a recipe link
      const recipeUrl = urlMatch[0];
      await reply(`Got it, ${from}! Parsing that recipe and building your Morrisons cart...`);
      cartUrl = await buildMorrisonsCart({ contentUrls: [recipeUrl] });
      await reply(`Here's your Morrisons cart with everything from that recipe:\n${cartUrl}`);
    } else {
      // Message is plain text: treat it as a grocery item list
      // e.g. "oat milk, pasta, eggs" or "add bananas and washing up liquid"
      await reply(`Adding that to Morrisons for you, ${from}...`);
      cartUrl = await buildMorrisonsCart({ contentText: text.trim() });
      await reply(`Here's your Morrisons cart:\n${cartUrl}`);
    }
  } catch (err) {
    console.error('Error handling message:', err.message);
    await reply(`Sorry ${from}, something went wrong. Try again in a moment.`);
  }
}

// ─── Demo: simulate two messages arriving in the group chat ──────────────────

async function simulateGroupChat() {
  // Collect "replies" for demo output
  const chatLog = [];
  const reply = async (text) => {
    chatLog.push({ from: 'GroceryBot', text });
    console.log(`[Bot] ${text}\n`);
  };

  console.log('=== Morrisons Grocery Bot — simulated group chat ===\n');

  // Message 1: Jamie drops a recipe URL at 11pm
  console.log('[Jamie] Hey can you add this to the shop? https://www.bbcgoodfood.com/recipes/pizza-margherita-4-easy-steps\n');
  await handleTelegramMessage(
    { from: 'Jamie', text: 'Hey can you add this to the shop? https://www.bbcgoodfood.com/recipes/pizza-margherita-4-easy-steps' },
    reply
  );

  // Message 2: Alex sends a plain text grocery list
  console.log('[Alex] oat milk, pasta, eggs, washing up liquid\n');
  await handleTelegramMessage(
    { from: 'Alex', text: 'oat milk, pasta, eggs, washing up liquid' },
    reply
  );

  console.log('\n=== Done. Each cart link opens a pre-filled Morrisons basket. ===');
}

simulateGroupChat().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
