import type { Language } from "./types.js";

const UNSAFE_PROMISE_RE =
  /\b(?:we\s+will|we'll|will)\s+(?:refund|reverse|recover|unblock|return\s+your\s+money|give\s+back)|\b(?:refund|reversal|recovery|account\s+unblock)\s+(?:is\s+)?(?:confirmed|guaranteed|done|approved)\b/i;
const SUSPICIOUS_THIRD_PARTY_RE =
  /\b(?:contact|call|message|whatsapp|send\s+money\s+to)\b.{0,50}\b(?:this\s+number|unknown\s+number|agent\s+outside|third\s+party|personal\s+number)\b/i;
const CREDENTIAL_REQUEST_RE =
  /\b(?:share|send|provide|tell|give|submit|enter)\b.{0,45}\b(?:otp|pin|password|cvv|full\s+card|card\s+number|secret\s+code)\b/i;
const SAFE_WARNING_RE =
  /\b(?:do\s+not|don't|never|must\s+not|should\s+not|please\s+do\s+not)\b.{0,45}\b(?:share|send|provide|tell|give|submit|enter)\b.{0,45}\b(?:otp|pin|password|cvv|full\s+card|card\s+number|secret\s+code)\b/i;

export function hasUnsafeCredentialRequest(text: string): boolean {
  if (!text) return false;
  if (!CREDENTIAL_REQUEST_RE.test(text)) return false;
  return !SAFE_WARNING_RE.test(text);
}

export function hasUnsafePromise(text: string): boolean {
  return Boolean(text && UNSAFE_PROMISE_RE.test(text));
}

export function hasSuspiciousThirdPartyInstruction(text: string): boolean {
  return Boolean(text && SUSPICIOUS_THIRD_PARTY_RE.test(text));
}

export function hasSafetyViolation(text: string): boolean {
  return hasUnsafeCredentialRequest(text) || hasUnsafePromise(text) || hasSuspiciousThirdPartyInstruction(text);
}

export function sanitizeCustomerReply(reply: string, language: Language): string {
  return hasSafetyViolation(reply) ? safeFallbackReply(language) : reply;
}

export function safeFallbackReply(language: Language): string {
  if (language === "bn") {
    return "আপনার অভিযোগটি আমরা গ্রহণ করেছি। আমাদের দল অফিসিয়াল সাপোর্ট চ্যানেলের মাধ্যমে বিষয়টি যাচাই করবে। অনুগ্রহ করে কারো সাথে আপনার পিন, ওটিপি, পাসওয়ার্ড বা কার্ডের তথ্য শেয়ার করবেন না।";
  }

  if (language === "mixed") {
    return "Apnar concern amra receive korechi. Official support channel er maddhome team eta review korbe. Please kono PIN, OTP, password, ba card details karo sathe share korben na.";
  }

  return "We have received your concern and our team will review it through official support channels. Please do not share your PIN, OTP, password, or card details with anyone.";
}
