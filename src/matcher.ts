import type { CaseType, ExtractedClues, MatchResult, TransactionHistoryEntry } from "./types.js";

const MIN_SELECT_SCORE = 45;
const AMBIGUITY_MARGIN = 25;
const DUPLICATE_WINDOW_SECONDS = 180;

function expectedTypes(caseType: CaseType): string[] {
  switch (caseType) {
    case "wrong_transfer":
      return ["transfer"];
    case "payment_failed":
      return ["payment", "cash_out"];
    case "duplicate_payment":
    case "refund_request":
      return ["payment"];
    case "merchant_settlement_delay":
      return ["settlement"];
    case "agent_cash_in_issue":
      return ["cash_in"];
    default:
      return [];
  }
}

function expectedStatuses(caseType: CaseType): string[] {
  switch (caseType) {
    case "wrong_transfer":
    case "duplicate_payment":
    case "refund_request":
      return ["completed"];
    case "payment_failed":
      return ["failed", "pending"];
    case "merchant_settlement_delay":
    case "agent_cash_in_issue":
      return ["pending"];
    default:
      return [];
  }
}

export function findDuplicatePayment(history: TransactionHistoryEntry[]): TransactionHistoryEntry | null {
  const payments = history
    .filter((tx) => tx.type === "payment" && tx.status === "completed")
    .slice()
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  for (let i = 0; i < payments.length; i += 1) {
    for (let j = i + 1; j < payments.length; j += 1) {
      const first = payments[i];
      const second = payments[j];
      if (!first || !second) continue;

      const sameAmount = Math.abs(first.amount - second.amount) < 0.01;
      const sameCounterparty = normalizeCounterparty(first.counterparty) === normalizeCounterparty(second.counterparty);
      const secondsApart = Math.abs(Date.parse(second.timestamp) - Date.parse(first.timestamp)) / 1000;

      if (sameAmount && sameCounterparty && secondsApart <= DUPLICATE_WINDOW_SECONDS) {
        return second;
      }
    }
  }

  return null;
}

export function matchTransaction(
  history: TransactionHistoryEntry[] | undefined,
  caseType: CaseType,
  clues: ExtractedClues
): MatchResult {
  const transactions = Array.isArray(history) ? history : [];

  if (caseType === "phishing_or_social_engineering" || transactions.length === 0) {
    return {
      transaction: null,
      score: 0,
      ambiguous: false,
      reason: "no_transaction_needed_or_available",
      candidates: []
    };
  }

  if (caseType === "duplicate_payment") {
    const duplicate = findDuplicatePayment(transactions);
    if (duplicate) {
      return {
        transaction: duplicate,
        score: 100,
        ambiguous: false,
        reason: "duplicate_pattern",
        candidates: [{ transaction: duplicate, score: 100, reasons: ["duplicate_pattern"] }]
      };
    }
  }

  const candidates = transactions
    .map((transaction) => ({ transaction, ...scoreTransaction(transaction, caseType, clues) }))
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const second = candidates[1];

  if (!best || best.score < MIN_SELECT_SCORE) {
    return {
      transaction: null,
      score: best?.score ?? 0,
      ambiguous: false,
      reason: "no_meaningful_match",
      candidates
    };
  }

  const exactIdMatch = best.reasons.includes("transaction_id_match");
  const closeSecond = Boolean(
    second && second.score >= MIN_SELECT_SCORE && best.score - second.score < AMBIGUITY_MARGIN
  );
  const sameAmountCluster =
    clues.amounts.length > 0 &&
    candidates.filter((candidate) => candidate.score >= 65 && candidate.reasons.includes("amount_match")).length > 1;

  if (!exactIdMatch && (closeSecond || sameAmountCluster)) {
    return {
      transaction: null,
      score: best.score,
      ambiguous: true,
      reason: "ambiguous_match",
      candidates
    };
  }

  return {
    transaction: best.transaction,
    score: best.score,
    ambiguous: false,
    reason: best.reasons.join(","),
    candidates
  };
}

function scoreTransaction(
  tx: TransactionHistoryEntry,
  caseType: CaseType,
  clues: ExtractedClues
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const txId = tx.transaction_id.toUpperCase();

  if (clues.mentionedTransactionIds.includes(txId)) {
    score += 120;
    reasons.push("transaction_id_match");
  }

  if (clues.amounts.some((amount) => Math.abs(amount - tx.amount) < 0.01)) {
    score += 35;
    reasons.push("amount_match");
  }

  if (expectedTypes(caseType).includes(tx.type)) {
    score += 30;
    reasons.push("type_match");
  }

  if (expectedStatuses(caseType).includes(tx.status)) {
    score += 20;
    reasons.push("status_match");
  }

  const txCounterparty = normalizeCounterparty(tx.counterparty);
  if (clues.phones.some((phone) => txCounterparty.includes(normalizeCounterparty(phone)))) {
    score += 30;
    reasons.push("phone_match");
  }
  if (clues.counterparties.some((party) => txCounterparty.includes(normalizeCounterparty(party)))) {
    score += 30;
    reasons.push("counterparty_match");
  }

  if (clues.timeHints.length > 0) {
    score += 5;
    reasons.push("time_hint_present");
  }

  if (caseType === "payment_failed" && tx.type === "payment" && tx.status === "completed") {
    score -= 20;
    reasons.push("status_contradicts_failed_claim");
  }

  return { score, reasons };
}

function normalizeCounterparty(value: string): string {
  return value.toLowerCase().replace(/[\s\-_+]/g, "");
}
