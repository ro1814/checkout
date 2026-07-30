import express from "express";
import { randomUUID } from "node:crypto";
import { quote, ValidationError } from "./pricing.js";
import { authorize } from "./payment.js";
import {
  hashRequestBody,
  getIdempotencyRecord,
  saveIdempotencyRecord,
  saveOrder,
} from "./store.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  /**
   * A. Quote — full price breakdown for a cart + country + shipping + optional promo.
   * An invalid promo never fails the quote; it comes back as { status: "rejected", reason }.
   */
  app.post("/api/checkout/quote", (req, res) => {
    try {
      const { items, country, shipping_method, promo_code } = req.body ?? {};
      res
        .status(200)
        .json(quote({ items, country, shipping_method, promo_code }));
    } catch (err) {
      handleError(err, res);
    }
  });

  /**
   * B. Place order — validates inputs, recomputes pricing on the server (client
   * totals are never trusted), runs the mock payment authorisation, creates the order.
   *
   * Idempotency:
   *  - same key + same body  -> replay the original response (no second order/charge)
   *  - same key + different body -> 409 Conflict
   *  - the record stores only a SHA-256 of the body, never the card number
   *
   * The handler is fully synchronous on purpose: there is no await between the
   * idempotency check and the write, so two concurrent identical requests cannot
   * both create an order in Node's single-threaded event loop.
   */
  app.post("/api/checkout/order", (req, res) => {
    const idempotencyKey = req.header("Idempotency-Key");
    if (!idempotencyKey) {
      return res
        .status(400)
        .json({
          error: "missing_idempotency_key",
          message: "Idempotency-Key header is required",
        });
    }

    const body = req.body ?? {};
    const bodyHash = hashRequestBody(body);

    const existing = getIdempotencyRecord(idempotencyKey);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        return res.status(409).json({
          error: "idempotency_key_reuse",
          message:
            "This Idempotency-Key was already used with a different request body",
        });
      }
      // Exact retry: replay the original response, do not charge again.
      return res.status(existing.statusCode).json(existing.response);
    }

    try {
      const {
        items,
        country,
        shipping_method,
        promo_code,
        email,
        card_number,
      } = body;

      if (
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        throw new ValidationError("invalid_email", "A valid email is required");
      }
      if (typeof card_number !== "string" || card_number.trim() === "") {
        throw new ValidationError(
          "missing_card_number",
          "A card number is required",
        );
      }

      // Server-authoritative pricing: recompute everything, ignore any client totals.
      const pricing = quote({ items, country, shipping_method, promo_code });

      const payment = authorize(card_number);
      if (!payment.approved) {
        const response = { error: "payment_declined", reason: payment.reason };
        // Store the outcome so an exact retry replays the decline instead of re-charging.
        saveIdempotencyRecord(idempotencyKey, bodyHash, 402, response);
        return res.status(402).json(response);
      }

      const order = {
        order_id: randomUUID(),
        status: "confirmed",
        email,
        country,
        shipping_method,
        items: pricing.items,
        subtotal_cents: pricing.subtotal_cents,
        discount_cents: pricing.discount_cents,
        shipping_cents: pricing.shipping_cents,
        total_cents: pricing.total_cents,
        vat_included_cents: pricing.vat_included_cents,
        promo: pricing.promo,
        created_at: new Date().toISOString(),
        // Deliberately no card_number anywhere.
      };
      saveOrder(order);

      const response = {
        order_id: order.order_id,
        status: order.status,
        total_cents: order.total_cents,
      };
      saveIdempotencyRecord(idempotencyKey, bodyHash, 201, response);
      return res.status(201).json(response);
    } catch (err) {
      // Validation failures are not recorded against the key: the client should
      // be able to fix the input and retry with the same key.
      handleError(err, res);
    }
  });

  return app;
}

function handleError(err, res) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.code, message: err.message });
  }
  console.error(err); // never contains card numbers — they are not attached to errors
  return res
    .status(500)
    .json({ error: "internal_error", message: "Something went wrong" });
}
