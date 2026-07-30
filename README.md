# Checkout Page — Full Stack Take-Home

A standalone checkout summary step: cart, delivery country, shipping method, optional promo code, server-computed totals, and idempotent order placement with a mock payment provider.

**Stack:** Node.js (Express, ESM) · React 19 + TypeScript (Vite) · plain CSS, mobile-first · Jest + Supertest.

## How to run

Requires Node ≥ 20 (developed on Node 22).

```bash
# Terminal 1 — API on :3001
cd server
npm install
npm run dev

# Terminal 2 — frontend on :5173 (proxies /api to :3001)
cd client
npm install
npm run dev
```

Open http://localhost:5173.

```bash
# Tests (pricing + idempotency)
cd server
npm test
```

## API

- `POST /api/checkout/quote` — full price breakdown for `{ items, country, shipping_method, promo_code? }`. An invalid promo never fails the quote; it returns `promo: { status: "rejected", reason }` with undiscounted totals, so the customer always sees their price.
- `POST /api/checkout/order` — requires an `Idempotency-Key` header. Validates inputs, **recomputes all pricing on the server** (any totals in the request body are ignored), runs the mock payment authorisation, creates the order.

Idempotency behaviour:

| Situation | Response |
|---|---|
| New key | Process normally (201, or 402 on decline) |
| Same key + same body | Replay the original response — same `order_id`, no second charge |
| Same key + different body | `409 Conflict` (`idempotency_key_reuse`) |

## Main decisions

- **Integer money everywhere.** All amounts are integer cents. `round_half_up(a / b)` is implemented with pure integer arithmetic — `floor((2a + b) / 2b)` — so there is no float error anywhere in the pricing path (`server/src/money.js`).
- **Pricing is one pure function.** `quote()` in `server/src/pricing.js` follows the brief's pricing steps in order and both endpoints call it. The order endpoint never trusts the client; it recomputes from raw inputs.
- **Idempotency records store a hash, not the body.** The request body contains the card number, so the record keeps only a SHA-256 digest (over canonical JSON, so property order doesn't matter) plus the original response for replay. Card numbers are never logged, stored, or returned.
- **The order handler is fully synchronous.** There is no `await` between the idempotency check and the write, so on Node's single-threaded event loop two concurrent identical requests cannot both create an order. With a real async payment gateway I'd store an `in_progress` record before calling out (see "With another day").
- **Declines are recorded against the key too**, so retrying an exact declined request replays the decline instead of hitting the payment provider again. Validation 400s are *not* recorded — the client should be able to fix its input and retry with the same key.
- **Frontend never calculates prices.** It only renders `*_cents` values from the server. Quote requests use an `AbortController` cancelled on every input change, so if the country changes twice quickly the stale response is discarded and the latest request always wins. The promo field fires a request only on Apply/Enter — never per keystroke.
- **Idempotency key lifecycle on the client:** one `crypto.randomUUID()` per payment attempt, kept for retries after network failures (that's the point of the key), discarded when inputs change or a card is declined, since those are genuinely new attempts.
- **FREESHIP zeroes only the selected shipping option** ("the selected shipping option becomes 0"); the other option keeps its listed price so the customer can still compare.

## A discrepancy in the brief

The example quote response shows `shipping_cents: 0` with a discounted subtotal of 4723, but the fixture rules say ES standard shipping is free only when the **discounted** subtotal is ≥ 5000 (and 4723 < 5000). I followed the written pricing steps as authoritative, so that cart + WELCOME10 yields shipping 499 and total 5222. Happy to talk through it — flagging it here per "if anything is unclear or contradictory, please let us know."

## Testing

Covered (25 tests): the pricing steps (rounding half up, promo min-spend before discount, each rejection reason, FREESHIP behaviour, ES free-shipping threshold against the discounted subtotal, VAT lines per country, unsupported country) and the order endpoint (idempotent replay, 409 on key reuse, declines, server-authoritative totals when the client sends tampered numbers, card number never in responses).

Deliberately not tested: the React components. The frontend contains no money logic — it renders server responses — so given the time box, tests went where the risk is. With more time I'd add React Testing Library coverage for the promo rejection messages and the disabled-while-submitting states, plus one Playwright happy path.

## What I traded off for time

- In-memory store (as invited by the brief) — restarting the server clears orders and idempotency records.
- The cart is fixed demo data; the brief's scope starts at the summary step, so there's no basket editing.
- Minimal email validation, no i18n, no auth (listed as skippable).

## With another day

- Persist idempotency records with a TTL (e.g. 24h, like Stripe) and an `in_progress` state to stay safe with a genuinely async payment provider.
- React Testing Library + one Playwright end-to-end flow.
- Extract shared API types into a small package instead of duplicating them in `client/src/types.ts`.
- Currency formatting per locale, and a quantity editor on the cart.

## Time spent

Roughly 5 hours.

Thank you for this opportunity, time and being able to finish reading this README `:)`.