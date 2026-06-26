export const LANGUAGES = ["en", "bn", "mixed"] as const;
export const CHANNELS = [
  "in_app_chat",
  "call_center",
  "email",
  "merchant_portal",
  "field_agent"
] as const;
export const USER_TYPES = ["customer", "merchant", "agent", "unknown"] as const;
export const TRANSACTION_TYPES = [
  "transfer",
  "payment",
  "cash_in",
  "cash_out",
  "settlement",
  "refund"
] as const;
export const TRANSACTION_STATUSES = ["completed", "failed", "pending", "reversed"] as const;
export const EVIDENCE_VERDICTS = ["consistent", "inconsistent", "insufficient_data"] as const;
export const CASE_TYPES = [
  "wrong_transfer",
  "payment_failed",
  "refund_request",
  "duplicate_payment",
  "merchant_settlement_delay",
  "agent_cash_in_issue",
  "phishing_or_social_engineering",
  "other"
] as const;
export const DEPARTMENTS = [
  "customer_support",
  "dispute_resolution",
  "payments_ops",
  "merchant_operations",
  "agent_operations",
  "fraud_risk"
] as const;
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;

export type Language = (typeof LANGUAGES)[number];
export type Channel = (typeof CHANNELS)[number];
export type UserType = (typeof USER_TYPES)[number];
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export type EvidenceVerdict = (typeof EVIDENCE_VERDICTS)[number];
export type CaseType = (typeof CASE_TYPES)[number];
export type Department = (typeof DEPARTMENTS)[number];
export type Severity = (typeof SEVERITIES)[number];

export interface TransactionHistoryEntry {
  transaction_id: string;
  timestamp: string;
  type: TransactionType;
  amount: number;
  counterparty: string;
  status: TransactionStatus;
}

export interface AnalyzeTicketRequest {
  ticket_id: string;
  complaint: string;
  language?: Language;
  channel?: Channel;
  user_type?: UserType;
  campaign_context?: string;
  transaction_history?: TransactionHistoryEntry[];
  metadata?: Record<string, unknown>;
}

export interface AnalyzeTicketResponse {
  ticket_id: string;
  relevant_transaction_id: string | null;
  evidence_verdict: EvidenceVerdict;
  case_type: CaseType;
  severity: Severity;
  department: Department;
  agent_summary: string;
  recommended_next_action: string;
  customer_reply: string;
  human_review_required: boolean;
  confidence: number;
  reason_codes: string[];
}

export interface ExtractedClues {
  normalized: string;
  compact: string;
  language: Language;
  mentionedTransactionIds: string[];
  amounts: number[];
  phones: string[];
  counterparties: string[];
  hasSpecificClue: boolean;
  timeHints: string[];
  keywordHits: string[];
}

export interface MatchResult {
  transaction: TransactionHistoryEntry | null;
  score: number;
  ambiguous: boolean;
  reason: string;
  candidates: Array<{ transaction: TransactionHistoryEntry; score: number; reasons: string[] }>;
}
