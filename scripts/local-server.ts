import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import analyzeTicketHandler from "../api/analyze-ticket.js";
import healthHandler from "../api/health.js";
import type { ApiRequest, ApiResponse } from "../src/http.js";

const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = await toApiRequest(incoming);
    const response = toApiResponse(outgoing);
    const path = new URL(incoming.url ?? "/", `http://${incoming.headers.host}`).pathname;

    if (path === "/health") {
      healthHandler(request, response);
      return;
    }

    if (path === "/analyze-ticket") {
      await analyzeTicketHandler(request, response);
      return;
    }

    writeJson(outgoing, 404, { error: "not_found" });
  } catch (error) {
    if (error instanceof SyntaxError) {
      writeJson(outgoing, 400, { error: "invalid_json" });
      return;
    }

    console.error("Local server error", error);
    writeJson(outgoing, 500, { error: "internal_error" });
  }
});

server.listen(port, () => {
  console.log(`QueueStorm API listening on http://localhost:${port}`);
});

async function toApiRequest(incoming: IncomingMessage): Promise<ApiRequest> {
  return {
    method: incoming.method,
    body: await readJsonBody(incoming)
  };
}

function toApiResponse(outgoing: ServerResponse): ApiResponse {
  return {
    setHeader(name, value) {
      outgoing.setHeader(name, value);
    },
    status(code) {
      outgoing.statusCode = code;
      return {
        json(payload: unknown) {
          writeJson(outgoing, code, payload);
        }
      };
    }
  };
}

async function readJsonBody(incoming: IncomingMessage): Promise<unknown> {
  if (incoming.method === "GET" || incoming.method === "HEAD") {
    return undefined;
  }

  const chunks: Buffer[] = [];

  for await (const chunk of incoming) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    return undefined;
  }

  return JSON.parse(rawBody);
}

function writeJson(outgoing: ServerResponse, statusCode: number, payload: unknown) {
  if (outgoing.writableEnded) {
    return;
  }

  outgoing.statusCode = statusCode;
  outgoing.setHeader("content-type", "application/json; charset=utf-8");
  outgoing.end(JSON.stringify(payload));
}
