import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeTicket } from "../src/analyzer.js";
import { hasSafetyViolation } from "../src/safety.js";
import {
  CASE_TYPES,
  CHANNELS,
  DEPARTMENTS,
  EVIDENCE_VERDICTS,
  LANGUAGES,
  SEVERITIES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  USER_TYPES
} from "../src/types.js";

type SampleCase = {
  id: string;
  label: string;
  input: Parameters<typeof analyzeTicket>[0];
  expected_output: ReturnType<typeof analyzeTicket>;
};

type SamplePackMeta = {
  schema_notes: {
    output_required_fields: string[];
  };
  allowed_enums: {
    language: string[];
    channel: string[];
    user_type: string[];
    transaction_type: string[];
    transaction_status: string[];
    evidence_verdict: string[];
    case_type: string[];
    severity: string[];
    department: string[];
  };
};

const samplePack = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "data", "SUST_Preli_Sample_Cases.json"), "utf8")
) as { _meta: SamplePackMeta; cases: SampleCase[] };

test("local enum constants match official sample _meta allowed_enums", () => {
  assert.deepEqual([...LANGUAGES], samplePack._meta.allowed_enums.language);
  assert.deepEqual([...CHANNELS], samplePack._meta.allowed_enums.channel);
  assert.deepEqual([...USER_TYPES], samplePack._meta.allowed_enums.user_type);
  assert.deepEqual([...TRANSACTION_TYPES], samplePack._meta.allowed_enums.transaction_type);
  assert.deepEqual([...TRANSACTION_STATUSES], samplePack._meta.allowed_enums.transaction_status);
  assert.deepEqual([...EVIDENCE_VERDICTS], samplePack._meta.allowed_enums.evidence_verdict);
  assert.deepEqual([...CASE_TYPES], samplePack._meta.allowed_enums.case_type);
  assert.deepEqual([...SEVERITIES], samplePack._meta.allowed_enums.severity);
  assert.deepEqual([...DEPARTMENTS], samplePack._meta.allowed_enums.department);
});

for (const sample of samplePack.cases) {
  test(`${sample.id}: ${sample.label}`, () => {
    const actual = analyzeTicket(sample.input);
    const expected = sample.expected_output;

    assert.equal(actual.ticket_id, expected.ticket_id);
    assert.equal(actual.relevant_transaction_id, expected.relevant_transaction_id);
    assert.equal(actual.evidence_verdict, expected.evidence_verdict);
    assert.equal(actual.case_type, expected.case_type);
    assert.equal(actual.department, expected.department);
    assert.equal(actual.severity, expected.severity);
    assert.equal(actual.human_review_required, expected.human_review_required);
    for (const field of samplePack._meta.schema_notes.output_required_fields) {
      assert.ok(field in actual, `${sample.id} missing required output field ${field}`);
    }
    assert.ok(samplePack._meta.allowed_enums.evidence_verdict.includes(actual.evidence_verdict));
    assert.ok(samplePack._meta.allowed_enums.case_type.includes(actual.case_type));
    assert.ok(samplePack._meta.allowed_enums.severity.includes(actual.severity));
    assert.ok(samplePack._meta.allowed_enums.department.includes(actual.department));
    assert.equal(typeof actual.agent_summary, "string");
    assert.equal(typeof actual.recommended_next_action, "string");
    assert.equal(typeof actual.customer_reply, "string");
    assert.equal(typeof actual.confidence, "number");
    assert.ok(Array.isArray(actual.reason_codes));
    assert.equal(hasSafetyViolation(actual.customer_reply), false);
    assert.equal(hasSafetyViolation(actual.recommended_next_action), false);
  });
}
