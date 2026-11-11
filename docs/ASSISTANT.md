# Ask AgroIntel: the assistant

The chat button on every page opens **Ask AgroIntel**. It works in two modes.

## Built-in mode (default, free)

With `assistantUrl` empty in `web/config.js`, the assistant runs entirely in the visitor's browser:

1. It finds the place named in the question (any of the 260 districts, 16 regions or 10 reservoirs) or uses the place selected at the top.
2. It recognises the topic (planting, rain, heat, drought, crops, soil, water, fires, risk, season).
3. It answers in English from the site's satellite data and the 16-day Open-Meteo forecast, and says where each figure comes from.

Voice input (where the browser supports it) and "Read aloud" are included. No server, no key, no cost.

## AI mode (natural language, local languages)

AI mode sends the same grounded context to a large language model, which writes the answer in plain language in English, Twi, Dagbani, Hausa, Ewe or French. The model is told to use only the numbers it is given.

The API key must never sit in the website, so a small proxy holds it:

1. Create an Anthropic API key at https://console.anthropic.com and set a monthly spend limit.
2. Create a free Cloudflare account → **Workers & Pages → Create → Worker**. Paste `assistant/worker.js` and deploy.
3. In the worker's **Settings → Variables**: add the secret `ANTHROPIC_API_KEY`, and the variable `ALLOWED_ORIGIN` = `https://abdul-sobbur.github.io`.
4. Copy the worker's address (e.g. `https://agrointel-assistant.<you>.workers.dev`) into `web/config.js`:
   ```js
   window.AGROINTEL_CONFIG = { assistantUrl: 'https://agrointel-assistant.<you>.workers.dev' };
   ```
5. Commit and push. A language menu appears in the chat header.

Each question is one short model call. The worker limits each visitor to 30 questions a day (`DAILY_LIMIT`). If the proxy fails, the chat falls back to the built-in answer.

**Before relying on local-language answers, have native speakers on the team check a sample.** Model quality in Dagbani and Ewe in particular is uneven.
