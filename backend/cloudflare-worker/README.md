# MARTENS_BLACK lead proxy

Cloudflare Worker hides the Bitrix webhook from the static GitHub Pages site and rejects noisy or unsafe form submissions before they reach CRM.

## What it checks

- only `POST /lead` is accepted;
- only configured origins are allowed through CORS;
- honeypot field `website` silently drops simple bots;
- too-fast submissions are rejected with a retry-safe error;
- request body size is capped;
- only the expected form fields are forwarded;
- client-provided `title`, `id_category`, and `formid` are ignored and replaced server-side;
- source attribution is forwarded as `website`, `source_website`, `page_url`, `landing_page`, `referrer`, `utm_*`, `gclid`, `yclid`, and `fbclid`;
- text is normalized, length-limited, and rejected when it contains HTML/script-friendly characters;
- IP and lead-identity rate limits are applied;
- Bitrix requests have a timeout.
- valid leads are stored in Cloudflare D1 before forwarding to Bitrix;
- if Bitrix is unavailable after the D1 write, the client still receives success and the lead remains in the database with `forward_status = failed`;
- `GET /export` can download CSV when called with `Authorization: Bearer <ADMIN_TOKEN>`.

## Setup

1. Install or run Wrangler:

```bash
npx wrangler --version
```

2. Add the real webhook as a secret. Do not commit it.

```bash
npx wrangler secret put BITRIX_WEBHOOK_URL
```

3. Add an admin token for CSV export:

```bash
npx wrangler secret put ADMIN_TOKEN
```

4. Optional but recommended: create persistent rate-limit storage.

```bash
npx wrangler kv namespace create RATE_LIMIT
```

Then paste the returned `id` into `wrangler.toml` under `[[kv_namespaces]]`.

Without KV the Worker still uses an in-memory limit, but it is not persistent across Cloudflare isolates.

5. Create and apply D1 migrations:

```bash
npx wrangler d1 create martensblack-leads
npx wrangler d1 migrations apply martensblack-leads --remote
```

6. Deploy:

```bash
npx wrangler deploy
```

7. The deployed Worker URL currently used by `index.html` is:

```text
https://martensblack-lead-proxy.endykartrait1488.workers.dev/lead
```

For a custom site domain, add it to `ALLOWED_ORIGINS`, separated by comma:

```toml
ALLOWED_ORIGINS = "https://primperiaforum.github.io,https://your-domain.ru"
```

## Local smoke test

Use a placeholder `.dev.vars` locally:

```bash
copy .dev.vars.example .dev.vars
npx wrangler dev
```

The placeholder webhook will make successful CRM delivery impossible, but validation/CORS behavior can still be checked.
