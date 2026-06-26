import {
  CHANNELS,
  LANGUAGES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  USER_TYPES,
  type AnalyzeTicketRequest,
  type Channel,
  type Language,
  type TransactionHistoryEntry,
  type TransactionStatus,
  type TransactionType,
  type UserType
} from "./types.js";

type ValidationIssue = {
  field: string;
  message: string;
};

export class ValidationError extends Error {
  readonly details: ValidationIssue[];

  constructor(details: ValidationIssue[]) {
    super("Invalid analyze-ticket request");
    this.name = "ValidationError";
    this.details = details;
  }
}

export class SemanticValidationError extends Error {
  readonly details: ValidationIssue[];

  constructor(details: ValidationIssue[]) {
    super("Semantically invalid analyze-ticket request");
    this.name = "SemanticValidationError";
    this.details = details;
  }
}

export function parseAnalyzeTicketRequest(input: unknown): AnalyzeTicketRequest {
  const issues: ValidationIssue[] = [];
  const semanticIssues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    throw new ValidationError([{ field: "body", message: "JSON object is required" }]);
  }

  const ticketId = readString(input, "ticket_id");
  const complaint = readString(input, "complaint");
  const language = readOptionalString(input, "language");
  const channel = readOptionalString(input, "channel");
  const userType = readOptionalString(input, "user_type");
  const campaignContext = readOptionalString(input, "campaign_context");
  const metadata = input.metadata;

  if (!ticketId || ticketId.trim().length === 0) {
    issues.push({ field: "ticket_id", message: "ticket_id is required" });
  }

  if (complaint === undefined) {
    issues.push({ field: "complaint", message: "complaint is required" });
  } else if (complaint.trim().length === 0) {
    semanticIssues.push({ field: "complaint", message: "complaint must not be empty" });
  }

  if (complaint && complaint.length > 8000) {
    issues.push({ field: "complaint", message: "complaint must be 8000 characters or fewer" });
  }

  if (language && !isLanguage(language)) {
    issues.push({ field: "language", message: `language must be one of: ${LANGUAGES.join(", ")}` });
  }

  if (channel && !isChannel(channel)) {
    issues.push({ field: "channel", message: `channel must be one of: ${CHANNELS.join(", ")}` });
  }

  if (userType && !isUserType(userType)) {
    issues.push({ field: "user_type", message: `user_type must be one of: ${USER_TYPES.join(", ")}` });
  }

  if (metadata !== undefined && !isRecord(metadata)) {
    issues.push({ field: "metadata", message: "metadata must be an object when provided" });
  }

  const transactionHistory = parseTransactionHistory(input.transaction_history, issues);

  if (issues.length > 0) {
    throw new ValidationError(issues);
  }

  if (semanticIssues.length > 0) {
    throw new SemanticValidationError(semanticIssues);
  }

  const parsed: AnalyzeTicketRequest = {
    ticket_id: ticketId!.trim(),
    complaint: complaint!.trim(),
    transaction_history: transactionHistory
  };

  if (language && isLanguage(language)) {
    parsed.language = language;
  }

  if (channel && isChannel(channel)) {
    parsed.channel = channel;
  }

  if (userType && isUserType(userType)) {
    parsed.user_type = userType;
  }

  if (campaignContext) {
    parsed.campaign_context = campaignContext.trim();
  }

  if (isRecord(metadata)) {
    parsed.metadata = metadata;
  }

  return parsed;
}

function parseTransactionHistory(input: unknown, issues: ValidationIssue[]): TransactionHistoryEntry[] {
  if (input === undefined || input === null) {
    return [];
  }

  if (!Array.isArray(input)) {
    issues.push({ field: "transaction_history", message: "transaction_history must be an array" });
    return [];
  }

  return input.map((entry, index) => parseTransactionEntry(entry, index, issues)).filter(isTransactionEntry);
}

function parseTransactionEntry(
  input: unknown,
  index: number,
  issues: ValidationIssue[]
): TransactionHistoryEntry | undefined {
  const prefix = `transaction_history[${index}]`;

  if (!isRecord(input)) {
    issues.push({ field: prefix, message: "transaction entry must be an object" });
    return undefined;
  }

  const transactionId = readString(input, "transaction_id");
  const timestamp = readString(input, "timestamp");
  const type = readString(input, "type");
  const amount = input.amount;
  const counterparty = readString(input, "counterparty");
  const status = readString(input, "status");

  if (!transactionId || transactionId.trim().length === 0) {
    issues.push({ field: `${prefix}.transaction_id`, message: "transaction_id is required" });
  }

  if (!timestamp || timestamp.trim().length === 0) {
    issues.push({ field: `${prefix}.timestamp`, message: "timestamp is required" });
  }

  if (!type || !isTransactionType(type)) {
    issues.push({
      field: `${prefix}.type`,
      message: `type must be one of: ${TRANSACTION_TYPES.join(", ")}`
    });
  }

  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    issues.push({ field: `${prefix}.amount`, message: "amount must be a finite number" });
  }

  if (!counterparty || counterparty.trim().length === 0) {
    issues.push({ field: `${prefix}.counterparty`, message: "counterparty is required" });
  }

  if (!status || !isTransactionStatus(status)) {
    issues.push({
      field: `${prefix}.status`,
      message: `status must be one of: ${TRANSACTION_STATUSES.join(", ")}`
    });
  }

  if (
    transactionId &&
    timestamp &&
    type &&
    isTransactionType(type) &&
    typeof amount === "number" &&
    Number.isFinite(amount) &&
    counterparty &&
    status &&
    isTransactionStatus(status)
  ) {
    return {
      transaction_id: transactionId.trim(),
      timestamp: timestamp.trim(),
      type,
      amount,
      counterparty: counterparty.trim(),
      status
    };
  }

  return undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  if (record[key] === undefined || record[key] === null || record[key] === "") {
    return undefined;
  }

  return readString(record, key);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

function isUserType(value: string): value is UserType {
  return (USER_TYPES as readonly string[]).includes(value);
}

function isTransactionType(value: string): value is TransactionType {
  return (TRANSACTION_TYPES as readonly string[]).includes(value);
}

function isTransactionStatus(value: string): value is TransactionStatus {
  return (TRANSACTION_STATUSES as readonly string[]).includes(value);
}

function isTransactionEntry(input: TransactionHistoryEntry | undefined): input is TransactionHistoryEntry {
  return input !== undefined;
}
