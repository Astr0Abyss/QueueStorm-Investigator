import { sanitizeCustomerReply } from "./safety.js";
import type { AnalyzeTicketRequest, AnalyzeTicketResponse } from "./types.js";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type LlmTextPatch = {
  agent_summary?: unknown;
  recommended_next_action?: unknown;
  customer_reply?: unknown;
  reason_codes?: unknown;
};

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_TIMEOUT_MS = 2500;
const MAX_TIMEOUT_MS = 5000;

export async function maybeEnhanceWithLlm(
  ticket: AnalyzeTicketRequest,
  baseline: AnalyzeTicketResponse
): Promise<AnalyzeTicketResponse> {
  if (!shouldUseLlm(ticket, baseline)) {
    return baseline;
  }

  const config = readLlmConfig();
  if (!config) {
    return baseline;
  }

  try {
    const patch = await requestTextPatch(ticket, baseline, config);
    return applyTextPatch(baseline, patch, ticket.language ?? "en");
  } catch {
    return baseline;
  }
}

function shouldUseLlm(ticket: AnalyzeTicketRequest, baseline: AnalyzeTicketResponse): boolean {
  if (process.env.ENABLE_LLM_FALLBACK !== "true") {
    return false;
  }

  if (baseline.case_type !== "other" && baseline.confidence >= 0.7) {
    return false;
  }

  if (baseline.evidence_verdict !== "insufficient_data") {
    return false;
  }

  return ticket.complaint.trim().length > 0;
}

function readLlmConfig():
  | {
      apiKey: string;
      model: string;
      baseUrl: string;
      timeoutMs: number;
    }
  | undefined {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const apiKey = nvidiaKey || process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY;
  const model = nvidiaKey
    ? process.env.NVIDIA_REPAIR_MODEL || process.env.NVIDIA_PLAN_MODEL || "deepseek-ai/deepseek-v4-pro"
    : process.env.AI_MODEL || process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
  const baseUrl = (
    nvidiaKey
      ? process.env.NVIDIA_BASE_URL || DEFAULT_NVIDIA_BASE_URL
      : process.env.AI_BASE_URL || process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL
  ).replace(/\/$/, "");
  const timeoutMs = Math.min(Number(process.env.LLM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS), MAX_TIMEOUT_MS);

  if (!apiKey) {
    return undefined;
  }

  return {
    apiKey,
    model,
    baseUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  };
}

async function requestTextPatch(
  ticket: AnalyzeTicketRequest,
  baseline: AnalyzeTicketResponse,
  config: { apiKey: string; model: string; baseUrl: string; timeoutMs: number }
): Promise<LlmTextPatch | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 350,
        messages: [
          {
            role: "system",
            content:
              "You improve support text for a fintech internal copilot. Return only compact JSON. Do not ask for PIN, OTP, password, CVV, full card number, or secret credentials. Do not promise refund, reversal, recovery, or account unblock. Do not change classification, routing, evidence verdict, severity, transaction id, or human review decisions."
          },
          {
            role: "user",
            content: JSON.stringify({
              complaint: ticket.complaint,
              language: ticket.language,
              baseline: {
                case_type: baseline.case_type,
                evidence_verdict: baseline.evidence_verdict,
                department: baseline.department,
                severity: baseline.severity,
                agent_summary: baseline.agent_summary,
                recommended_next_action: baseline.recommended_next_action,
                customer_reply: baseline.customer_reply,
                reason_codes: baseline.reason_codes
              },
              requested_json_shape: {
                agent_summary: "one safe sentence",
                recommended_next_action: "one operational next step",
                customer_reply: "safe customer-facing reply",
                reason_codes: ["optional_short_label"]
              }
            })
          }
        ]
      })
    });

    if (!response.ok) {
      console.warn(`LLM text enrichment skipped: provider returned HTTP ${response.status}`);
      return undefined;
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    return content ? parseJsonPatch(content) : undefined;
  } catch (error) {
    const message = error instanceof Error ? error.name : "unknown_error";
    console.warn(`LLM text enrichment skipped: ${message}`);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonPatch(content: string): LlmTextPatch | undefined {
  const trimmed = content.trim();
  const json = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;

  try {
    const parsed: unknown = JSON.parse(json);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function applyTextPatch(
  baseline: AnalyzeTicketResponse,
  patch: LlmTextPatch | undefined,
  language: "en" | "bn" | "mixed"
): AnalyzeTicketResponse {
  if (!patch) {
    return baseline;
  }

  const next = { ...baseline };
  const agentSummary = readSafeString(patch.agent_summary, 280);
  const nextAction = readSafeString(patch.recommended_next_action, 320);
  const customerReply = readSafeString(patch.customer_reply, 420);

  if (agentSummary) next.agent_summary = agentSummary;
  if (nextAction) next.recommended_next_action = nextAction;
  if (customerReply) next.customer_reply = sanitizeCustomerReply(customerReply, language);

  if (Array.isArray(patch.reason_codes)) {
    const extraCodes = patch.reason_codes.filter((code): code is string => typeof code === "string").slice(0, 3);
    next.reason_codes = Array.from(new Set([...baseline.reason_codes, ...extraCodes, "llm_text_enriched"])).slice(0, 8);
  } else if (agentSummary || nextAction || customerReply) {
    next.reason_codes = Array.from(new Set([...baseline.reason_codes, "llm_text_enriched"])).slice(0, 8);
  }

  return next;
}

function readSafeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    return undefined;
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
