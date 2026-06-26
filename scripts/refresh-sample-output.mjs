import { readFile, writeFile } from "node:fs/promises";

const baseUrl = process.env.BASE_URL;

if (!baseUrl) {
  console.error("Set BASE_URL, for example: BASE_URL=https://your-app.vercel.app npm run refresh:sample");
  process.exit(2);
}

const cleanBase = baseUrl.replace(/\/$/, "");
const request = await readFile("sample-request.json", "utf8");
const response = await fetch(`${cleanBase}/analyze-ticket`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: request
});

const body = await response.text();

if (!response.ok) {
  throw new Error(`Live sample refresh failed: ${response.status} ${body}`);
}

const parsed = JSON.parse(body);
await writeFile("sample-output.json", `${JSON.stringify(parsed, null, 2)}\n`);
console.log(`Refreshed sample-output.json from ${cleanBase}/analyze-ticket`);
