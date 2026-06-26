import type { ApiRequest, ApiResponse } from "../src/http.js";

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  return res.status(200).json({ status: "ok" });
}
