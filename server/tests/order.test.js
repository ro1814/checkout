import request from "supertest";
import { createApp } from "../src/app.js";
import { resetStore, orderCount } from "../src/store.js";

const APPROVED_CARD = "4111111111111111";

const validOrder = (overrides = {}) => ({
  items: [
    { sku: "TSHIRT-001", quantity: 2 },
    { sku: "MUG-042", quantity: 1 },
  ],
  country: "ES",
  shipping_method: "standard",
  promo_code: "WELCOME10",
  email: "ro@example.com",
  card_number: APPROVED_CARD,
  ...overrides,
});

let app;
beforeEach(() => {
  resetStore();
  app = createApp();
});

describe("POST /api/checkout/order — happy path and server-authoritative pricing", () => {
  test("creates a confirmed order with the server-computed total", async () => {
    const res = await request(app)
      .post("/api/checkout/order")
      .set("Idempotency-Key", "key-1")
      .send(validOrder());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.order_id).toBeDefined();
    // 5248 - 525 (WELCOME10) = 4723; < 5000 so ES standard shipping 499 applies.
    expect(res.body.total_cents).toBe(5222);
  });

  test("ignores any totals the client sends — pricing is recomputed on the server", async () => {
    const res = await request(app)
      .post("/api/checkout/order")
      .set("Idempotency-Key", "key-tamper")
      .send(validOrder({ total_cents: 1, subtotal_cents: 1 }));

    expect(res.status).toBe(201);
    expect(res.body.total_cents).toBe(5222); // not 1
  });

  test("never returns the card number", async () => {
    const res = await request(app)
      .post("/api/checkout/order")
      .set("Idempotency-Key", "key-pan")
      .send(validOrder());
    expect(JSON.stringify(res.body)).not.toContain(APPROVED_CARD);
  });

  test("rejects a missing Idempotency-Key", async () => {
    const res = await request(app)
      .post("/api/checkout/order")
      .send(validOrder());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing_idempotency_key");
  });
});

describe("POST /api/checkout/order — idempotency", () => {
  test("same key + same body replays the original order instead of creating a second one", async () => {
    const body = validOrder();
    const first = await request(app)
      .post("/api/checkout/order")
      .set("Idempotency-Key", "dup")
      .send(body);
    const second = await request(app)
      .post("/api/checkout/order")
      .set("Idempotency-Key", "dup")
      .send(body);

    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body); // byte-for-byte replay, same order_id
    expect(orderCount()).toBe(1); // no double charge, no second order
  });

  test("same key + different body returns 409 Conflict", async () => {
    await request(app)
      .post("/api/checkout/order")
      .set("Idempotency-Key", "reused")
      .send(validOrder());
    const res = await request(app)
      .post("/api/checkout/order")
      .set("Idempotency-Key", "reused")
      .send(validOrder({ shipping_method: "express" }));

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("idempotency_key_reuse");
    expect(orderCount()).toBe(1);
  });

  test("body hashing is key-order independent: reordered JSON keys count as the same body", async () => {
    const body = validOrder();
    const reordered = {
      card_number: body.card_number,
      email: body.email,
      promo_code: body.promo_code,
      shipping_method: body.shipping_method,
      country: body.country,
      items: body.items,
    };
    const first = await request(app)
      .post("/api/checkout/order")
      .set("Idempotency-Key", "order-keys")
      .send(body);
    const second = await request(app)
      .post("/api/checkout/order")
      .set("Idempotency-Key", "order-keys")
      .send(reordered);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
  });
});

describe("POST /api/checkout/order — payment declines", () => {
  test.each([
    ["4000000000000002", "card_declined"],
    ["4000000000000069", "expired_card"],
  ])(
    "card %s is declined with %s and no order is created",
    async (card, reason) => {
      const res = await request(app)
        .post("/api/checkout/order")
        .set("Idempotency-Key", `decline-${reason}`)
        .send(validOrder({ card_number: card }));

      expect(res.status).toBe(402);
      expect(res.body).toEqual({ error: "payment_declined", reason });
      expect(orderCount()).toBe(0);
    },
  );

  test("retrying a declined attempt with the same key + body replays the decline (no re-charge)", async () => {
    const body = validOrder({ card_number: "4000000000000002" });
    await request(app)
      .post("/api/checkout/order")
      .set("Idempotency-Key", "declined-retry")
      .send(body);
    const retry = await request(app)
      .post("/api/checkout/order")
      .set("Idempotency-Key", "declined-retry")
      .send(body);
    expect(retry.status).toBe(402);
    expect(retry.body.reason).toBe("card_declined");
  });
});

describe("POST /api/checkout/quote", () => {
  test("returns the breakdown and keeps invalid promos non-fatal", async () => {
    const res = await request(app)
      .post("/api/checkout/quote")
      .send({
        items: [{ sku: "MUG-042", quantity: 1 }],
        country: "FR",
        shipping_method: "express",
        promo_code: "VIP50",
      });

    expect(res.status).toBe(200);
    expect(res.body.promo).toEqual({
      code: "VIP50",
      status: "rejected",
      reason: "already_redeemed",
    });
    expect(res.body.total_cents).toBe(1250 + 1499);
  });

  test("rejects unsupported countries with country_not_supported", async () => {
    const res = await request(app)
      .post("/api/checkout/quote")
      .send({
        items: [{ sku: "MUG-042", quantity: 1 }],
        country: "US",
        shipping_method: "standard",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("country_not_supported");
  });
});
