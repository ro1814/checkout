import { createHash } from "node:crypto";

/**
 * In-memory store — the brief says a database isn't needed at this size.
 * Two maps: orders by id, and idempotency records by key.
 *
 * An idempotency record stores only a SHA-256 digest of the request body
 * (never the raw body — it contains the card number) plus the response we
 * originally sent, so an identical retry replays it byte-for-byte.
 */
const orders = new Map();
const idempotencyRecords = new Map();

/** Stable hash: keys are sorted recursively so property order can't change the digest. */
export function hashRequestBody(body) {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function getIdempotencyRecord(key) {
  return idempotencyRecords.get(key);
}

export function saveIdempotencyRecord(key, bodyHash, statusCode, response) {
  idempotencyRecords.set(key, { bodyHash, statusCode, response });
}

export function saveOrder(order) {
  orders.set(order.order_id, order);
}

export function orderCount() {
  return orders.size;
}

/** Test helper. */
export function resetStore() {
  orders.clear();
  idempotencyRecords.clear();
}
