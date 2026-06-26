# Member 2 Integration Notes

## What was integrated

- Replaced the Member 1 placeholder analyzer with the Member 2 deterministic reasoning engine.
- Added transaction matching, evidence verdicts, routing, severity, human-review rules, and safe response templates.
- Added helper modules:
  - `src/matcher.ts`
  - `src/safety.ts`
  - `src/text.ts`
- Added all 10 official public sample cases under `tests/data/SUST_Preli_Sample_Cases.json`.
- Added public sample and hidden-style tests.

## Key thresholds

- Minimum transaction selection score: `45`
- Ambiguity margin: `25`
- Duplicate payment window: `180` seconds
- High-value human-review threshold: `25000` BDT

## Safety behavior

- Safe warning phrases such as "Please do not share your PIN or OTP" are allowed.
- Actual requests for PIN, OTP, password, CVV, full card number, or secret code are blocked.
- Refund/reversal/recovery/account-unblock promises are blocked.
- Suspicious third-party contact instructions are blocked.

## Verification

Commands run:

```bash
npm.cmd run build
npm.cmd test
npm.cmd run check
npm.cmd run smoke
```

Result:

- Build passed.
- 22 tests passed.
- All 10 official public sample cases passed.
- Hidden-style tests passed for prompt injection, safe warning phrases, refund safety, inconsistent failed-payment evidence, Banglish wrong transfer, and ambiguous transfer handling.
