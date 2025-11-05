# quai.red Dashboard

`quai.red` is a real‑time dashboard for tracking QUAI ↔ QI conversion rates, USD benchmarks, and historical on-chain pricing. The project is forked from [dominant-strategies/quaiqi-dashboard](https://github.com/dominant-strategies/quaiqi-dashboard) and has been extended with RPC batching, Supabase caching, and front-end polish tailored for quai.red.

## Features

- **Live conversion quotes** – instant QUAI ⇄ QI rates with slippage-aware calculations.
- **USD benchmarks** – QI price is derived from the QUAI/USD feed and refreshed continuously.
- **Historical charts** – RPC-sourced history up to six months, smoothed and densified for clean visuals.
- **Serverless caching** – Supabase stores recent ranges, with stale-while-revalidate refresh logic to limit RPC load.
- **Vercel ready** – designed to run behind Vercel’s `vercel dev` / `vercel deploy` workflow.

## Getting Started

```bash
npm install
npm run dev    # starts the Vite dev server
npm run lint   # good practice :)
```

Create an `.env.local` file with your keys before running the API route:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE=...
```

The Supabase table `qi_price_history` expects columns:

| column            | type     | notes                                |
|-------------------|----------|--------------------------------------|
| `range`           | text     | primary key part (`1h`, `24h`, …)    |
| `timestamp_ms`    | bigint   | primary key part                     |
| `price`           | numeric  | smoothed QI/USD price                |
| `block_number_hex`| text     | block reference                      |
| `fetched_at`      | timestamptz | last refresh timestamp          |

## Clearing cached ranges

When you adjust smoothing parameters or want to purge stale data, run the full cleanup script:

```bash
npx tsx --env-file .env.local - <<'TS'
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseServiceRole) {
  console.error('Missing Supabase environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRole, {
  auth: { persistSession: false },
});

const { error } = await supabase
  .from('qi_price_history')
  .delete()
  .in('range', ['1h', '24h', '7d', '30d', '6m']);

if (error) {
  console.error('Failed to clear cache:', error);
  process.exit(1);
}

console.log('Cleared cached ranges.');
TS
```

## Stack

- React + Vite + TypeScript
- Supabase (Postgres + PostgREST) for caching
- Tailwind/Shadcn UI components
- Vercel serverless functions (`/api/qi-history`)

## API

`GET /api/qi-history` returns smoothed price history for a given range.

### Query parameters

| name   | type   | required | notes                                  |
|--------|--------|----------|----------------------------------------|
| `range`| string | no       | One of `1h`, `24h`, `7d`, `30d`, `6m`. Defaults to `24h`.

### Response shape

```json
{
  "data": [
    {
      "timestamp_ms": 1762200130000,
      "price": 0.58210128,
      "block_number_hex": "0x47c472"
    }
  ],
  "source": "cache"
}
```

- `source` is either `cache` or `rpc`; when the cache is older than the freshness window, the endpoint returns the cached values and triggers a background refresh.
- On cache refresh failure you may see `{"error": "RPC request failed..."}` with status 502–503.
- The data is already smoothed/filtered (median + MAD-based clamp) to remove single-block spikes, so you should not re-smooth on the client.

### Rate limits & caching

- Supabase rows are keyed by `(range, timestamp_ms)`; the cleanup script in this README clears the ranges when smoothing parameters change.
- Vercel/Cloudflare may edge-cache the response for up to 5 minutes; pass `cache: "no-store"` if you need a fresh fetch from the browser.
- Direct RPC access is intentionally hidden behind the API to avoid rate-limit issues.

## Support ❤️

If `quai.red` helps you, consider grabbing some free QUAI through my Kipper tipping app referral: [kipper.money/r/cmevbba2a0001ky04elop2ekn](https://kipper.money/r/cmevbba2a0001ky04elop2ekn), or send directly at `0x0037cc0a803Fe5D9a06047B40F049A3B8b2256AC` (`rob.quai`).

## License

Apache License 2.0 – see [LICENSE](./LICENSE) for details.
