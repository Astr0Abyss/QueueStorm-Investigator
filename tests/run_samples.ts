import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeTicket } from "../src/analyzer.js";

type SampleCase = {
  id: string;
  label: string;
  input: Parameters<typeof analyzeTicket>[0];
};

const samplePack = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "data", "SUST_Preli_Sample_Cases.json"), "utf8")
) as { cases: SampleCase[] };

const outputs = samplePack.cases.map((sample) => ({
  id: sample.id,
  label: sample.label,
  output: analyzeTicket(sample.input)
}));

writeFileSync(join(process.cwd(), "sample-outputs.generated.json"), JSON.stringify(outputs, null, 2), "utf8");
console.log(`Generated ${outputs.length} sample outputs.`);
