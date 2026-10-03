import { config } from "../config.js";

const BASE = "https://api.stripe.com/v1";

export class StripeError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // off | api | bad | mismatch
  }
}

export const stripeEnabled = () => Boolean(config.stripe.secretKey);

// Stripe takes form-encoded bodies with bracketed keys: line_items[0][price_data][currency]=usd
function encode(fields) {
  const body = new URLSearchParams();
  const walk = (prefix, value) => {
    if (value === undefined || value === null) return;
    if (typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) walk(`${prefix}[${key}]`, inner);
    } else {
      body.append(prefix, String(value));
    }
  };
  for (const [key, value] of Object.entries(fields)) walk(key, value);
  return body;
}

async function call(path, init = {}) {
  if (!stripeEnabled()) throw new StripeError("off", "Stripe is not configured");
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${config.stripe.secretKey}`, ...init.headers },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new StripeError("api", `Stripe request failed: ${error.message}`);
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    // a gateway error page is handled below as a failed call
  }
  if (!response.ok || !body || body.error) {
    throw new StripeError("api", `Stripe answered ${response.status} ${body?.error?.type ?? ""} ${body?.error?.message ?? ""}`.trim());
  }
  return body;
}

// A Checkout Session is Stripe's hosted payment page. The amount is in cents. Stripe wants the expiry 30 minutes to 24 hours ahead.
export async function createCheckoutSession({ orderCode, guildId, productName, amountCents, successUrl, cancelUrl, now = Date.now() }) {
  const session = await call("/checkout/sessions", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "idempotency-key": `order-${orderCode}` },
    body: encode({
      mode: "payment",
      client_reference_id: String(orderCode),
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: Math.floor(now / 1000) + 31 * 60,
      metadata: { order_code: String(orderCode), guild_id: guildId },
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amountCents, product_data: { name: productName } } }],
    }),
  });
  if (!session.id || !session.url) throw new StripeError("bad", "Stripe gave no checkout link");
  return { checkoutUrl: session.url, sessionId: session.id };
}

// "paid" only when Stripe says the money was collected AND the session is the one this order made, for the amount it asked for.
// A session that says otherwise is an error, never a payment, so a mixed up id can never switch a plan on.
export async function getPayment(sessionId, { orderCode, amountCents }) {
  const session = await call(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (String(session.client_reference_id ?? "") !== String(orderCode) || session.amount_total !== amountCents || String(session.currency ?? "").toLowerCase() !== "usd") {
    throw new StripeError("mismatch", `Stripe session ${sessionId} does not match order ${orderCode}`);
  }
  const status = String(session.payment_status ?? "").toUpperCase();
  const paid = session.status === "complete" && session.payment_status === "paid";
  const closed = session.status === "expired";
  return { status: closed ? "EXPIRED" : status, paid, closed };
}
