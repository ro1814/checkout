// Types mirroring the API contract. The client only ever *displays* money —
// it never calculates it. The server is the source of truth.

export type Country = "ES" | "PT" | "FR" | "IT" | "DE";
export type ShippingMethod = "standard" | "express";

export interface CartItem {
  sku: string;
  quantity: number;
}

export interface QuoteLineItem extends CartItem {
  name: string;
  unit_price_cents: number;
  line_total_cents: number;
}

export type PromoStatus =
  | { code: string; status: "applied"; description: string }
  | {
      code: string;
      status: "rejected";
      reason: "not_found" | "already_redeemed" | "min_spend_not_met";
    };

export interface ShippingOption {
  method: ShippingMethod;
  label: string;
  price_cents: number;
  eta_days: string;
}

export interface Quote {
  currency: "EUR";
  items: QuoteLineItem[];
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  total_cents: number;
  vat_included_cents: number;
  promo: PromoStatus | null;
  shipping_options: ShippingOption[];
}

export interface OrderConfirmation {
  order_id: string;
  status: "confirmed";
  total_cents: number;
}

export interface ApiError {
  error: string;
  message?: string;
  reason?: string;
}
