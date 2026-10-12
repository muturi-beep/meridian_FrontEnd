// backend/services/mpesa.js
// Safaricom Daraja API client - OAuth + STK Push.
const axios = require("axios");

const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const PASSKEY = process.env.MPESA_PASSKEY;
const SHORTCODE = process.env.MPESA_SHORTCODE;
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL;
const CALLBACK_SECRET = process.env.MPESA_CALLBACK_SECRET;

const BASE_URL =
  process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

// ── In-memory token cache (Safaricom tokens last ~1 hour) ──
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString(
    "base64",
  );
  const response = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } },
  );

  cachedToken = response.data.access_token;
  // Refresh 60s before actual expiry (Safaricom returns expires_in in seconds)
  const ttl = (Number(response.data.expires_in) || 3599) * 1000;
  cachedTokenExpiry = Date.now() + ttl - 60_000;

  return cachedToken;
}

/**
 * Normalize a phone number to the format Safaricom expects: 2547XXXXXXXX / 2541XXXXXXXX
 * Accepts: 0712..., +254712..., 254712..., 712...
 */
function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) throw new Error("Phone number is empty.");

  let normalized = digits;
  if (normalized.startsWith("0")) normalized = "254" + normalized.slice(1);
  else if (normalized.startsWith("254")) {
    /* already good */
  } else if (normalized.length === 9) normalized = "254" + normalized;

  if (!/^254(7|1)\d{8}$/.test(normalized)) {
    throw new Error(
      "Invalid Kenyan phone number. Use format 2547XXXXXXXX or 07XXXXXXXX.",
    );
  }
  return normalized;
}

async function initiateSTKPush(
  rawPhone,
  amount,
  accountReference,
  transactionDesc,
) {
  if (
    !CONSUMER_KEY ||
    !CONSUMER_SECRET ||
    !PASSKEY ||
    !SHORTCODE ||
    !CALLBACK_URL ||
    !CALLBACK_SECRET
  ) {
    throw new Error(
      "M-Pesa is not configured on this server. Please contact support.",
    );
  }

  const phone = normalizePhone(rawPhone);

  const token = await getAccessToken();

  // Timestamp format: YYYYMMDDHHmmss
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const timestamp =
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());

  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString(
    "base64",
  );

  const payload = {
    BusinessShortCode: SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(Number(amount)),
    PartyA: phone,
    PartyB: SHORTCODE,
    PhoneNumber: phone,
    CallBackURL: `${CALLBACK_URL}/${CALLBACK_SECRET}`,
    AccountReference: String(accountReference).slice(0, 12),
    TransactionDesc: String(transactionDesc).slice(0, 13),
  };

  const response = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  return response.data; // { MerchantRequestID, CheckoutRequestID, ResponseCode, ResponseDescription, CustomerMessage }
}

module.exports = { getAccessToken, initiateSTKPush, normalizePhone };
