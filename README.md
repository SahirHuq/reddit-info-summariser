# Resurface

Chat with, summarise and connect your saved Reddit posts. This build runs on demo data (no Reddit API).

## Layout

- `public/index.html`: the app (single compiled page)
- `api/health.js`: tells the app which AI mode is on
- `api/ai/complete.js`: forwards AI requests to Claude (`claude-haiku-5-5`)

## AI key

Two modes, picked automatically:

- **Server key**: set `ANTHROPIC_API_KEY` in Vercel → Project → Settings → Environment Variables. AI works for every visitor and is billed to that key, so set a spend limit on it in the Anthropic Console.
- **Bring your own key**: leave it unset. Each visitor pastes their own key in the app's Settings page; it stays in their browser.

## Deploy

```bash
npx vercel deploy --prod
```
