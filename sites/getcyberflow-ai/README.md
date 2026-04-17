# getcyberflow.ai landing page

Static landing page for a compliance-facing CyberFlow AI advisory surface.

## Local preview

```bash
cd sites/getcyberflow-ai
python3 -m http.server 4173
```

## Vercel

Deploy the `sites/getcyberflow-ai` directory as a static site.

If the project is already linked in your Vercel account:

```bash
vercel --prod
```

Set the root directory to `sites/getcyberflow-ai`.

### Payment hook readiness

This site now ships a small Vercel function at `/api/payment-hook-ready`.

Set these environment variables in Vercel before using it:

- `LEMON_SQUEEZY_API_KEY`
- `LEMON_SQUEEZY_STORE_ID`
- `LEMON_SQUEEZY_WEBHOOK_SECRET`
- One of:
  - `LEMON_SQUEEZY_PAYMENT_LINK`
  - `LEMON_SQUEEZY_CHECKOUT_URL`
  - `LEMON_SQUEEZY_VARIANT_ID`

Check readiness from the repo root:

```bash
node scripts/check-getcyberflow-payment-hook.mjs https://getcyberflow.ai
```

## GitHub Pages

Publish this folder as the Pages source and keep `CNAME` so the custom domain
remains `getcyberflow.ai`.
