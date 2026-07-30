import type {
  CartItem,
  Country,
  OrderConfirmation,
  Quote,
  ShippingMethod,
} from "./types";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public reason?: string,
  ) {
    super(message ?? code);
  }
}

async function post<T>(
  url: string,
  body: unknown,
  options: { signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...options.headers },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      data.error ?? "unknown_error",
      data.message,
      data.reason,
    );
  }
  return data as T;
}

export interface QuoteRequest {
  items: CartItem[];
  country: Country;
  shipping_method: ShippingMethod;
  promo_code?: string;
}

/** The AbortSignal lets the caller cancel stale requests so the latest quote always wins. */
export function fetchQuote(
  req: QuoteRequest,
  signal: AbortSignal,
): Promise<Quote> {
  return post<Quote>("/api/checkout/quote", req, { signal });
}

export interface OrderRequest extends QuoteRequest {
  email: string;
  card_number: string;
}

export function placeOrder(
  req: OrderRequest,
  idempotencyKey: string,
): Promise<OrderConfirmation> {
  return post<OrderConfirmation>("/api/checkout/order", req, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
