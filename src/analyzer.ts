import { findDuplicatePayment, matchTransaction } from "./matcher.js";
import { sanitizeCustomerReply } from "./safety.js";
import { containsAny, extractClues } from "./text.js";
import type {
  AnalyzeTicketRequest,
  AnalyzeTicketResponse,
  CaseType,
  Department,
  EvidenceVerdict,
  ExtractedClues,
  Severity,
  TransactionHistoryEntry
} from "./types.js";

const HIGH_VALUE_REVIEW_THRESHOLD = 25_000;

const PHISHING = [
  "otp",
  "pin",
  "password",
  "verification code",
  "secret code",
  "cvv",
  "full card",
  "card number",
  "asked for my otp",
  "asked for otp",
  "account will be blocked",
  "fake bkash",
  "suspicious call",
  "scam",
  "fraud",
  "ওটিপি",
  "পিন",
  "পাসওয়ার্ড",
  "পাসওয়ার্ড",
  "ভেরিফিকেশন",
  "প্রতারক",
  "ব্লক"
];
const WRONG_TRANSFER = [
  "wrong number",
  "wrong person",
  "wrong recipient",
  "mistake",
  "mistakenly",
  "by mistake",
  "recover money",
  "didn't get it",
  "did not get it",
  "not received",
  "ভুল নম্বর",
  "ভুল নাম্বার",
  "ভুলে পাঠিয়েছি",
  "ভুলে পাঠিয়েছি",
  "wrong number e",
  "pathaisi"
];
const PAYMENT_FAILED = [
  "payment failed",
  "transaction failed",
  "failed",
  "balance deducted",
  "deducted",
  "money cut",
  "recharge failed",
  "ফেইল",
  "ফেল",
  "কেটে",
  "কাটা"
];
const REFUND = ["refund", "return money", "money back", "changed my mind", "cancel payment", "taka ferot", "ফেরত"];
const DUPLICATE = ["duplicate", "double charged", "twice", "deducted twice", "charged twice", "দুইবার", "ডাবল"];
const SETTLEMENT = ["settlement", "settled", "sales", "সেটেলমেন্ট"];
const CASH_IN = [
  "cash in",
  "cash-in",
  "cashin",
  "agent",
  "balance not reflected",
  "not reflected",
  "taka ashe nai",
  "টাকা আসেনি",
  "ক্যাশ ইন",
  "এজেন্ট"
];

export function analyzeTicket(ticket: AnalyzeTicketRequest): AnalyzeTicketResponse {
  const safeTicket: AnalyzeTicketRequest = {
    ...ticket,
    complaint: typeof ticket.complaint === "string" ? ticket.complaint : "",
    transaction_history: Array.isArray(ticket.transaction_history) ? ticket.transaction_history : []
  };
  const clues = extractClues(safeTicket);
  const caseType = detectCaseType(safeTicket, clues);
  const history = safeTicket.transaction_history ?? [];
  const match = matchTransaction(history, caseType, clues);
  const relevant = match.transaction;
  const evidence = decideEvidence(caseType, clues, history, relevant, match.ambiguous);
  const department = decideDepartment(caseType, safeTicket);
  const severity = decideSeverity(caseType, evidence, relevant, match.ambiguous);
  const humanReviewRequired = decideHumanReview(caseType, evidence, severity, relevant, match.ambiguous);
  const reasonCodes = buildReasonCodes(caseType, evidence, match.reason, relevant, clues, match.ambiguous);
  const confidence = decideConfidence(evidence, caseType, relevant, match.ambiguous, clues);
  const texts = buildTexts(safeTicket, clues, caseType, evidence, department, severity, relevant, match.ambiguous);

  return {
    ticket_id: safeTicket.ticket_id,
    relevant_transaction_id: relevant?.transaction_id ?? null,
    evidence_verdict: evidence,
    case_type: caseType,
    severity,
    department,
    agent_summary: texts.agent_summary,
    recommended_next_action: texts.recommended_next_action,
    customer_reply: sanitizeCustomerReply(texts.customer_reply, clues.language),
    human_review_required: humanReviewRequired,
    confidence,
    reason_codes: reasonCodes
  };
}

function detectCaseType(ticket: AnalyzeTicketRequest, clues: ExtractedClues): CaseType {
  const text = clues.normalized;
  const history = ticket.transaction_history ?? [];

  if (containsAny(text, PHISHING)) return "phishing_or_social_engineering";
  if (containsAny(text, DUPLICATE) || findDuplicatePayment(history)) return "duplicate_payment";
  if (
    containsAny(text, SETTLEMENT) ||
    (history.some((tx) => tx.type === "settlement") &&
      (ticket.user_type === "merchant" || ticket.channel === "merchant_portal"))
  ) {
    return "merchant_settlement_delay";
  }
  if (
    containsAny(text, CASH_IN) ||
    history.some((tx) => tx.type === "cash_in" && tx.status === "pending" && containsAny(text, ["agent", "cash", "ক্যাশ", "এজেন্ট"]))
  ) {
    return "agent_cash_in_issue";
  }
  if (containsAny(text, PAYMENT_FAILED)) return "payment_failed";
  if (containsAny(text, WRONG_TRANSFER)) return "wrong_transfer";
  if (containsAny(text, REFUND)) return "refund_request";
  if (clues.amounts.length > 0 && history.some((tx) => tx.type === "transfer")) return "wrong_transfer";

  return "other";
}

function decideEvidence(
  caseType: CaseType,
  clues: ExtractedClues,
  history: TransactionHistoryEntry[],
  relevant: TransactionHistoryEntry | null,
  ambiguous: boolean
): EvidenceVerdict {
  if (caseType === "phishing_or_social_engineering") return "insufficient_data";
  if (caseType === "other" || ambiguous || !clues.hasSpecificClue) return "insufficient_data";
  if (!relevant) return "insufficient_data";
  if (caseType === "wrong_transfer" && hasEstablishedRecipientPattern(history, relevant)) return "inconsistent";
  if (caseType === "payment_failed" && relevant.type === "payment" && relevant.status === "completed") {
    return "inconsistent";
  }
  if (caseType === "agent_cash_in_issue" && relevant.type === "cash_in" && relevant.status === "completed") {
    return "inconsistent";
  }
  return "consistent";
}

function decideDepartment(caseType: CaseType, ticket: AnalyzeTicketRequest): Department {
  switch (caseType) {
    case "wrong_transfer":
      return "dispute_resolution";
    case "payment_failed":
    case "duplicate_payment":
      return "payments_ops";
    case "merchant_settlement_delay":
      return "merchant_operations";
    case "agent_cash_in_issue":
      return "agent_operations";
    case "phishing_or_social_engineering":
      return "fraud_risk";
    case "refund_request":
      return ticket.user_type === "merchant" ? "merchant_operations" : "customer_support";
    default:
      return "customer_support";
  }
}

function decideSeverity(
  caseType: CaseType,
  evidence: EvidenceVerdict,
  relevant: TransactionHistoryEntry | null,
  ambiguous: boolean
): Severity {
  if (caseType === "phishing_or_social_engineering") return "critical";
  if (caseType === "other") return "low";
  if (caseType === "refund_request") return evidence === "insufficient_data" ? "medium" : "low";
  if (caseType === "merchant_settlement_delay") return "medium";
  if (caseType === "wrong_transfer" && evidence === "inconsistent") return "medium";
  if (ambiguous) return "medium";
  if (relevant && relevant.amount >= HIGH_VALUE_REVIEW_THRESHOLD) return "high";
  if (
    caseType === "wrong_transfer" ||
    caseType === "payment_failed" ||
    caseType === "duplicate_payment" ||
    caseType === "agent_cash_in_issue"
  ) {
    return "high";
  }
  return "medium";
}

function decideHumanReview(
  caseType: CaseType,
  evidence: EvidenceVerdict,
  severity: Severity,
  relevant: TransactionHistoryEntry | null,
  ambiguous: boolean
): boolean {
  if (caseType === "phishing_or_social_engineering") return true;
  if (caseType === "wrong_transfer") return evidence !== "insufficient_data";
  if (caseType === "duplicate_payment") return true;
  if (caseType === "agent_cash_in_issue") return evidence === "consistent" || evidence === "inconsistent";
  if (severity === "critical") return true;
  if (relevant && relevant.amount >= HIGH_VALUE_REVIEW_THRESHOLD) return true;
  if (ambiguous) return false;
  return false;
}

function hasEstablishedRecipientPattern(
  history: TransactionHistoryEntry[],
  relevant: TransactionHistoryEntry | null
): boolean {
  if (!relevant || relevant.type !== "transfer") return false;
  const sameCounterpartyCompleted = history.filter(
    (tx) => tx.type === "transfer" && tx.status === "completed" && tx.counterparty === relevant.counterparty
  );
  return sameCounterpartyCompleted.length >= 3;
}

function buildReasonCodes(
  caseType: CaseType,
  evidence: EvidenceVerdict,
  matchReason: string,
  relevant: TransactionHistoryEntry | null,
  clues: ExtractedClues,
  ambiguous: boolean
): string[] {
  const codes = new Set<string>([caseType]);
  if (evidence === "consistent") codes.add("evidence_consistent");
  if (evidence === "inconsistent") codes.add("evidence_inconsistent");
  if (evidence === "insufficient_data") codes.add("insufficient_data");
  if (relevant) codes.add("transaction_match");
  if (ambiguous) codes.add("ambiguous_match");
  if (matchReason === "duplicate_pattern") codes.add("duplicate_pattern");
  if (clues.language === "bn" || clues.language === "mixed") codes.add("local_language_detected");
  if (caseType === "phishing_or_social_engineering") codes.add("credential_protection");
  return Array.from(codes).slice(0, 6);
}

function decideConfidence(
  evidence: EvidenceVerdict,
  caseType: CaseType,
  relevant: TransactionHistoryEntry | null,
  ambiguous: boolean,
  clues: ExtractedClues
): number {
  if (caseType === "phishing_or_social_engineering") return 0.95;
  if (ambiguous) return 0.65;
  if (evidence === "consistent" && relevant) return 0.9;
  if (evidence === "inconsistent" && relevant) return 0.75;
  if (!clues.hasSpecificClue) return 0.55;
  return 0.62;
}

function buildTexts(
  ticket: AnalyzeTicketRequest,
  clues: ExtractedClues,
  caseType: CaseType,
  evidence: EvidenceVerdict,
  department: Department,
  severity: Severity,
  relevant: TransactionHistoryEntry | null,
  ambiguous: boolean
): Pick<AnalyzeTicketResponse, "agent_summary" | "recommended_next_action" | "customer_reply"> {
  const amount = relevant ? `${relevant.amount} BDT` : clues.amounts[0] ? `${clues.amounts[0]} BDT` : "the reported amount";
  const tx = relevant ? `transaction ${relevant.transaction_id}` : "the reported issue";
  const bn = clues.language === "bn";
  const mixed = clues.language === "mixed";

  if (caseType === "phishing_or_social_engineering") {
    return {
      agent_summary:
        "Customer reports a suspicious credential request or social engineering attempt. No transaction match is required for this safety case.",
      recommended_next_action:
        "Escalate to fraud_risk immediately. Remind the customer that official support never asks for PIN, OTP, password, or card secrets.",
      customer_reply: bn
        ? "তথ্য শেয়ার করার আগে যোগাযোগ করার জন্য ধন্যবাদ। আমরা কখনো আপনার পিন, ওটিপি বা পাসওয়ার্ড চাই না। কেউ অফিসিয়াল পরিচয় দিলেও এসব তথ্য শেয়ার করবেন না। আমাদের ফ্রড টিম বিষয়টি পর্যালোচনা করবে।"
        : mixed
          ? "Information share korar age contact korar jonno dhonnobad. Amra kokhono PIN, OTP, password chai na. Official bole claim korleo egulo share korben na. Fraud team issue ta review korbe."
          : "Thank you for reaching out before sharing any information. We never ask for your PIN, OTP, or password. Please do not share these with anyone, even if they claim to be from official support. Our fraud team will review this incident."
    };
  }

  if (ambiguous) {
    return {
      agent_summary: `Customer complaint appears to involve ${amount}, but multiple transactions could match. The correct transaction cannot be determined safely from the supplied history.`,
      recommended_next_action:
        "Ask for a disambiguating detail such as transaction ID, recipient number, counterparty, exact time, or amount before initiating any workflow.",
      customer_reply: bn
        ? "ধন্যবাদ। একই ধরনের একাধিক লেনদেন দেখা যাচ্ছে, তাই সঠিক লেনদেনটি নিশ্চিত করতে আরও তথ্য দরকার। অনুগ্রহ করে ট্রানজ্যাকশন আইডি, নম্বর বা সময় জানান। আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।"
        : "Thank you for reaching out. We see more than one possible matching transaction, so we need one more detail such as the transaction ID, recipient number, or exact time. Please do not share your PIN or OTP with anyone."
    };
  }

  switch (caseType) {
    case "wrong_transfer":
      return {
        agent_summary:
          evidence === "inconsistent"
            ? `Customer claims ${tx} was a wrong transfer, but transaction history suggests an established recipient pattern.`
            : `Customer reports a possible wrong transfer involving ${tx}${relevant ? ` for ${amount} to ${relevant.counterparty}` : ""}.`,
        recommended_next_action:
          evidence === "insufficient_data"
            ? "Ask the customer for the transaction ID, amount, recipient number, and approximate time before opening a dispute."
            : "Verify the transaction details and route through the wrong-transfer dispute workflow with human review.",
        customer_reply: bn
          ? `আপনার ${relevant ? `লেনদেন ${relevant.transaction_id}` : "অভিযোগ"} সম্পর্কে আমরা অবগত হয়েছি। আমাদের ডিসপিউট দল বিষয়টি যাচাই করবে এবং অফিসিয়াল চ্যানেলের মাধ্যমে জানাবে। আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`
          : `We have received your concern${relevant ? ` about transaction ${relevant.transaction_id}` : ""}. Our dispute team will review the case and contact you through official support channels. Please do not share your PIN or OTP with anyone.`
      };
    case "payment_failed":
      return {
        agent_summary: `Customer reports a failed payment or deducted balance issue involving ${tx}${relevant ? ` for ${amount}` : ""}. Evidence verdict: ${evidence}.`,
        recommended_next_action:
          "Check ledger and payment status. If a failed payment caused a deduction, process it through the standard eligible reversal flow.",
        customer_reply: `We have noted the issue${relevant ? ` with transaction ${relevant.transaction_id}` : ""}. Our payments team will review the payment status, and any eligible amount will be returned through official channels. Please do not share your PIN or OTP with anyone.`
      };
    case "refund_request":
      return {
        agent_summary: `Customer requests a refund${relevant ? ` for ${tx} (${amount})` : ""}. Refund eligibility depends on policy, merchant context, and transaction status.`,
        recommended_next_action:
          "Review refund eligibility. For completed merchant payments, guide the customer according to merchant policy and internal support procedure.",
        customer_reply:
          "Thank you for reaching out. Refund eligibility depends on the transaction context and applicable policy. Our support team will guide you through official channels. Please do not share your PIN or OTP with anyone."
      };
    case "duplicate_payment":
      return {
        agent_summary: `Customer reports a duplicate payment. ${relevant ? `${relevant.transaction_id} appears to be the suspected duplicate for ${amount}.` : "No duplicate transaction could be selected confidently."}`,
        recommended_next_action:
          "Verify the duplicate with payments_ops and the biller/merchant records. If confirmed eligible, use the standard reversal workflow.",
        customer_reply: `We have noted the possible duplicate payment${relevant ? ` for transaction ${relevant.transaction_id}` : ""}. Our payments team will verify it, and any eligible amount will be returned through official channels. Please do not share your PIN or OTP with anyone.`
      };
    case "merchant_settlement_delay":
      return {
        agent_summary: `Merchant reports delayed settlement${relevant ? ` ${relevant.transaction_id} for ${amount}` : ""}. Current evidence verdict: ${evidence}.`,
        recommended_next_action:
          "Route to merchant_operations to verify settlement batch status and communicate an official ETA if delayed.",
        customer_reply: `We have noted your settlement concern${relevant ? ` about ${relevant.transaction_id}` : ""}. Our merchant operations team will check the batch status and update you through official channels.`
      };
    case "agent_cash_in_issue":
      return {
        agent_summary: `Customer reports cash-in through an agent not reflected in balance${relevant ? ` (${relevant.transaction_id}, ${amount}, status ${relevant.status})` : ""}.`,
        recommended_next_action:
          "Route to agent_operations to verify agent-side cash-in status and resolve according to the standard cash-in SLA.",
        customer_reply: bn
          ? `আপনার ${relevant ? `লেনদেন ${relevant.transaction_id}` : "ক্যাশ ইন"} সম্পর্কে আমরা অবগত হয়েছি। এজেন্ট অপারেশন্স দল বিষয়টি যাচাই করবে এবং অফিসিয়াল চ্যানেলের মাধ্যমে জানাবে। আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`
          : `We have noted your cash-in concern${relevant ? ` about transaction ${relevant.transaction_id}` : ""}. Our agent operations team will review it and update you through official support channels. Please do not share your PIN or OTP with anyone.`
      };
    default:
      return {
        agent_summary: `Customer complaint is vague or outside the main taxonomy. Evidence verdict: ${evidence}; suggested department: ${department}; severity: ${severity}.`,
        recommended_next_action:
          "Ask the customer for the transaction ID, amount, approximate time, and a brief description of what went wrong.",
        customer_reply: bn
          ? "ধন্যবাদ। দ্রুত সহায়তার জন্য অনুগ্রহ করে ট্রানজ্যাকশন আইডি, টাকার পরিমাণ, সময় এবং কী সমস্যা হয়েছে তা জানান। আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।"
          : "Thank you for reaching out. To help you faster, please share the transaction ID, amount, approximate time, and a short description of what went wrong. Please do not share your PIN or OTP with anyone."
      };
  }
}
