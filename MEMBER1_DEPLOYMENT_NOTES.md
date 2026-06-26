# Member 1 Deployment Notes

## What changed

- Added the final `POST /analyze-ticket` API handler.
- Changed `GET /health` to return exactly `{ "status": "ok" }`.
- Replaced the warmup request/response types with the official QueueStorm Investigator schema.
- Added validation for `complaint`, optional enums, and `transaction_history`.
- Added a safe placeholder `analyzeTicket()` adapter for Member 2 to replace.
- Updated local routing, Vercel rewrites, npm scripts, and `.env.example`.

## Local setup

```bash
npm install
```

## Local test commands

```bash
npm run build
npm test
npm run smoke
npm run check
```

## Local run

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Analyze check:

```bash
curl -X POST http://localhost:3000/analyze-ticket \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\":\"TKT-005\",\"complaint\":\"Someone called me asking for OTP. Is this real?\",\"language\":\"en\",\"channel\":\"call_center\",\"user_type\":\"customer\",\"transaction_history\":[]}"
```

## Vercel deployment

```bash
npm run check
npx vercel
npx vercel --prod
```

Verify:

```bash
curl https://YOUR-VERCEL-URL/health
```

## Render deployment

- Render is a backup path. One stable public live URL is enough for submission.
- Environment: Node
- Build command: `npm install`
- Start command: `npm run start`
- The app reads `process.env.PORT`, so Render can assign the port.
- `tsx` is in runtime dependencies because `npm run start` executes `tsx scripts/local-server.ts`.

## Known limitations

- The current analyzer is a safe placeholder for Member 1 integration only.
- It detects credential-risk phishing complaints and otherwise returns `other`.
- Member 2 should replace `src/analyzer.ts` with full evidence reasoning and transaction matching.
- Safety checks should allow warning phrases such as "do not share your PIN or OTP" while still blocking actual requests for credentials.

## Final endpoint checklist

- `GET /health`
- `POST /analyze-ticket`
- No secrets required by default
- No stack traces returned to clients
- JSON validation errors return controlled error bodies
