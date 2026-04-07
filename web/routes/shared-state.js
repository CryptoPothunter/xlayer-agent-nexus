/**
 * Shared mutable state — payment records, quote store
 * Shared across route modules that need common in-memory stores.
 */
const paymentRecords = [];
const quoteStore = new Map();

// Quote store TTL cleanup (every 60s)
setInterval(() => {
  const now = Date.now();
  for (const [id, q] of quoteStore) {
    if (now > q.expiresAt + 60000) quoteStore.delete(id);
  }
}, 60000);

module.exports = { paymentRecords, quoteStore };
