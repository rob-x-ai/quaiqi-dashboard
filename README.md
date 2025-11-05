# quai.red Dashboard

`quai.red` is a real‑time dashboard for tracking QUAI ↔ QI conversion rates, USD benchmarks, and historical on-chain pricing. The project is forked from [dominant-strategies/quaiqi-dashboard](https://github.com/dominant-strategies/quaiqi-dashboard) and has been extended with RPC batching, Supabase caching, and front-end polish tailored for quai.red.

> **Support this project ❤️** 
If `quai.red` helps you, consider grabbing some free QUAI through my Kipper tipping app referral: [kipper.money/r/cmevbba2a0001ky04elop2ekn](https://kipper.money/r/cmevbba2a0001ky04elop2ekn), or send directly at `0x0037cc0a803Fe5D9a06047B40F049A3B8b2256AC` (`rob.quai`).

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
  .in('range', ['1h', '24h', '7d', '30d']);

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

## License

Apache License 2.0 – see [LICENSE](./LICENSE) for details.
