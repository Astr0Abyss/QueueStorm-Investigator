# MEMBER3_QA_REPORT

## Scope

Member 3 package for testing, safety QA, documentation, sample output, runbook, and final verification checklist.

## Tests Created

- `tests/public_samples.test.ts`
  - checks all 10 official public sample cases against functional expected fields
- `tests/hidden_style.test.ts`
  - prompt injection
  - safe credential-warning false-positive check
  - refund request with no history
  - completed-payment contradiction
  - Banglish wrong transfer
  - ambiguous multiple transfers
- `tests/schema_and_safety.test.ts`
  - required output fields
  - exact enum values
  - `confidence` range
  - `relevant_transaction_id` type
  - unsafe credential request detection
  - unauthorized refund/reversal promise detection
  - Bangla customer replies do not move internal agent fields out of English
- `tests/api_contract.test.ts`
  - missing complaint returns `400`
  - empty complaint returns `422`
  - metadata object is accepted
  - malformed metadata returns a controlled `400`
- `tests/malformed_input_notes.test.ts`
  - analyzer fails safe for missing `transaction_history`
  - analyzer fails safe for empty complaint
  - documents API-layer malformed input cases
- `tests/live_smoke.ts`
  - checks deployed/local `/health`
  - checks deployed/local `/analyze-ticket`

## Commands Run

```bash
npm.cmd run build
npm.cmd test
npm.cmd run check
npm.cmd run samples
BASE_URL=http://127.0.0.1:3000 npm.cmd run live-smoke
```

## Pass/Fail Result

Final integrated repo result: run `npm.cmd run check` for current count and status.

Local HTTP smoke result:

- `GET /health` returned `{"status":"ok"}`
- `POST /analyze-ticket` accepted `sample-request.json`
- `npm run live-smoke` passed against `http://127.0.0.1:3000`

## Safety Cases Checked

- does not ask for OTP, PIN, password, CVV, full card number
- does not promise refund, reversal, recovery, or account unblock
- prompt injection does not override safety policy
- safe text like "Please do not share your PIN or OTP" is not falsely blocked

## Documentation Created

- `README.md`
- `RUNBOOK.md`
- `.env.example`
- `sample-output.json`
- `sample-outputs.generated.json`
- `MEMBER3_QA_REPORT.md`

## Deployment Verification Checklist

- live base URL is public
- `GET /health` returns exactly `{"status":"ok"}`
- `POST /analyze-ticket` accepts JSON and returns JSON
- endpoint does not require login
- no stack traces or secrets in error responses
- service responds within judge timeout

## Remaining Integration Risks

- The final repo uses `tsx` with Node 20+, so no Node 22 `--experimental-strip-types` requirement remains.
- Before final submission, regenerate `sample-output.json` from the deployed endpoint and confirm GitHub access for `bipulhf`.
