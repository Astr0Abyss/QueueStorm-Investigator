import { analyzeTicket } from "../src/analyzer.js";
import type { ApiRequest, ApiResponse } from "../src/http.js";
import { maybeEnhanceWithLlm } from "../src/llm.js";
import { parseAnalyzeTicketRequest, SemanticValidationError, ValidationError } from "../src/schema.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const ticket = parseAnalyzeTicketRequest(req.body);
    const baseline = analyzeTicket(ticket);
    const result = await maybeEnhanceWithLlm(ticket, baseline);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        error: "invalid_request",
        details: error.details
      });
    }

    if (error instanceof SemanticValidationError) {
      return res.status(422).json({
        error: "semantically_invalid_request",
        details: error.details
      });
    }

    if (isMalformedJsonError(error)) {
      return res.status(400).json({ error: "invalid_json" });
    }

    console.error("Unexpected /analyze-ticket failure", error);
    return res.status(500).json({ error: "internal_error" });
  }
}

function isMalformedJsonError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 400 && /invalid json/i.test(error.message);
}
