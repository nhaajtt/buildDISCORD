import { createHmac } from "node:crypto";
import { config } from "../config.js";

const BASE = "https://api-merchant.payos.vn";

export class PayError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // off | api | bad
  }
}

export const payosEnabled = () => Boolean(config.payos.clientId && config.payos.apiKey && config.payos.checksumKey);

// payOS signs a payment request over these five fields, sorted by name: HMAC-SHA256 with the channel's checksum key
export function signPaymentRequest({ amount, cancelUrl, description, orderCode, returnUrl }, checksumKey = config.payos.checksumKey) {
  const data = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
  return createHmac("sha256", checksumKey).update(data).digest("hex");
}

async function call(path, init = {}) {
  if (!payosEnabled()) throw new PayError("off", "payOS is not configured");
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-client-id": config.payos.clientId, "x-api-key": config.payos.apiKey, ...init.headers },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new PayError("api", `payOS request failed: ${error.message}`);
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    // an HTML error page from a gateway is handled below as a failed call
  }
  if (!response.ok || !body || body.code !== "00") {
    throw new PayError("api", `payOS answered ${response.status} ${body?.code ?? ""} ${body?.desc ?? ""}`.trim());
  }
  return body.data;
}

// Creates a payment link. The description may be at most 9 characters for accounts not linked through payOS, so callers keep it short.
export async function createPaymentLink({ orderCode, amount, description, returnUrl, cancelUrl }) {
  const request = { orderCode, amount, description, cancelUrl, returnUrl };
  const data = await call("/v2/payment-requests", {
    method: "POST",
    body: JSON.stringify({ ...request, signature: signPaymentRequest(request) }),
  });
  if (!data?.checkoutUrl) throw new PayError("bad", "payOS gave no checkout link");
  return { checkoutUrl: data.checkoutUrl, paymentLinkId: data.paymentLinkId };
}

// Looks an order up by its code. "paid" is true when payOS says PAID, or when the whole amount has arrived.
export async function getPayment(orderCode) {
  const data = await call(`/v2/payment-requests/${orderCode}`);
  const status = String(data.status ?? "").toUpperCase();
  const paid = status === "PAID" || (Number(data.amount) > 0 && Number(data.amountPaid) >= Number(data.amount));
  const closed = ["CANCELLED", "EXPIRED", "FAILED"].includes(status);
  return { status, paid, closed };
}
