import type { AnalyzeTicketRequest, ExtractedClues, Language } from "./types.js";

const BANGLA_CHAR_RE = /[\u0980-\u09ff]/;

export function normalizeText(input: string): string {
  return replaceBanglaDigits(input)
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function compactText(input: string): string {
  return normalizeText(input).replace(/[\s\-_]+/g, "");
}

export function detectLanguage(ticket: AnalyzeTicketRequest): Language {
  if (ticket.language === "bn" || ticket.language === "mixed" || ticket.language === "en") {
    return ticket.language;
  }

  const complaint = ticket.complaint || "";
  if (BANGLA_CHAR_RE.test(complaint)) {
    const asciiLetters = complaint.match(/[a-z]/gi)?.length ?? 0;
    return asciiLetters > 8 ? "mixed" : "bn";
  }

  return "en";
}

export function containsAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

export function extractClues(ticket: AnalyzeTicketRequest): ExtractedClues {
  const normalized = normalizeText(ticket.complaint ?? "");
  const compact = compactText(ticket.complaint ?? "");
  const language = detectLanguage(ticket);

  const mentionedTransactionIds = Array.from(
    new Set((normalized.match(/\btxn[-_\s]?[a-z0-9]+\b/gi) ?? []).map((id) => id.replace(/\s+/g, "").toUpperCase()))
  );

  const amounts = Array.from(
    new Set(
      (normalized.match(/\b\d+(?:\.\d+)?\b/g) ?? [])
        .map(Number)
        .filter((value) => Number.isFinite(value) && value > 0 && value < 10_000_000)
    )
  );

  const phones = Array.from(
    new Set(
      (normalized.match(/(?:\+?88)?01[3-9]\d{8}/g) ?? []).map((phone) =>
        phone.startsWith("+") ? phone : phone.startsWith("88") ? `+${phone}` : `+88${phone}`
      )
    )
  );

  const counterparties = Array.from(
    new Set(normalized.match(/\b(?:merchant|agent|biller)[-_]?[a-z0-9]+\b/gi) ?? [])
  ).map((value) => value.toUpperCase());

  const timeHints = [
    "today",
    "yesterday",
    "morning",
    "evening",
    "afternoon",
    "night",
    "2pm",
    "11am",
    "সকাল",
    "বিকাল",
    "গতকাল",
    "আজ"
  ].filter((hint) => normalized.includes(hint));

  const keywordHits = [
    "wrong",
    "failed",
    "fail",
    "fail hoise",
    "deducted",
    "kete",
    "kete geche",
    "refund",
    "duplicate",
    "twice",
    "settlement",
    "cash in",
    "cash-in",
    "otp",
    "pin",
    "password",
    "ভুল",
    "ফেইল",
    "ফেল",
    "ক্যাশ",
    "ওটিপি",
    "পিন"
  ].filter((word) => normalized.includes(word));

  return {
    normalized,
    compact,
    language,
    mentionedTransactionIds,
    amounts,
    phones,
    counterparties,
    hasSpecificClue:
      mentionedTransactionIds.length > 0 ||
      amounts.length > 0 ||
      phones.length > 0 ||
      counterparties.length > 0 ||
      keywordHits.length > 0,
    timeHints,
    keywordHits
  };
}

function replaceBanglaDigits(input: string): string {
  return input.replace(/[\u09e6-\u09ef]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6));
}
