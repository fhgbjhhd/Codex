const requiredKeys = [
  "LEMON_SQUEEZY_API_KEY",
  "LEMON_SQUEEZY_STORE_ID",
  "LEMON_SQUEEZY_WEBHOOK_SECRET",
];

const linkKeys = [
  "LEMON_SQUEEZY_PAYMENT_LINK",
  "LEMON_SQUEEZY_CHECKOUT_URL",
  "LEMON_SQUEEZY_VARIANT_ID",
];

export default function handler(_request, response) {
  const env = process.env;
  const missing = requiredKeys.filter((key) => !String(env[key] || "").trim());
  const linkKey = linkKeys.find((key) => String(env[key] || "").trim());
  const ready = missing.length === 0 && Boolean(linkKey);

  response.setHeader("Cache-Control", "no-store");
  response.status(ready ? 200 : 503).json({
    ready,
    checkedAt: new Date().toISOString(),
    missing,
    linkSource: linkKey || null,
  });
}
