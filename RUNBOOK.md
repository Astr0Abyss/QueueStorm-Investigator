# RUNBOOK

## 1. Install

```bash
npm install
```

## 2. Run Tests

```bash
npm run check
```

Expected:

```text
all tests pass
```

## 3. Generate Public Sample Outputs

```bash
npm run samples
```

This writes:

```text
sample-outputs.generated.json
```

Before final submission, regenerate `sample-output.json` from the deployed endpoint, not from a hand-written example.

## 4. Run Final API Locally

Use the main integrated repository command, for example:

```bash
npm run dev
```

Then verify:

```bash
curl http://localhost:3000/health
```

Expected:

```json
{"status":"ok"}
```

## 5. Live Smoke Test

```bash
BASE_URL=http://localhost:3000 npm run live-smoke
```

For deployed URL:

```bash
BASE_URL=https://YOUR-DEPLOYED-URL npm run live-smoke
```

## 6. Malformed Input Checklist

The API layer should return controlled JSON errors for:

- malformed JSON
- missing body
- missing `ticket_id`
- missing `complaint` -> `400`
- empty complaint -> `422`
- invalid `language`
- invalid `channel`
- invalid transaction `type`
- invalid transaction `status`
- `transaction_history` not array

Do not expose stack traces, environment variables, tokens, or secrets.

## 7. Final Submission Checklist

- `/health` returns exactly `{"status":"ok"}`
- `/analyze-ticket` returns all required fields
- exact enum values are used
- all 10 public samples pass functionally
- safety tests pass
- live endpoint works without login
- README explains setup, AI/model usage, safety logic, limitations
- sample output included
- `.env.example` included
- no real secrets committed
- GitHub repo is public or organizer handle `bipulhf` has read access
- one teammate owns the official submission form in the final 15 minutes
- deployed `sample-output.json` captured from a real public sample request
