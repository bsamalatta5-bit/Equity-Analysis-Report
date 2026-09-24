import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

/**
 * A2.5: "A schema parity test asserts every attribute named in
 * docs/adr/data-model.md exists in the generated Prisma client type."
 * Uses Prisma's DMMF (the same metadata the generated Client's types are
 * derived from) rather than duck-typing an instance, so this genuinely
 * checks the generated Client, not just the schema.prisma source text.
 */
function parseDataModelDoc(markdown: string): Map<string, string[]> {
  const fencedBlock = markdown.match(/```\n([\s\S]*?)\n```/);
  if (!fencedBlock) {
    throw new Error("Expected a fenced code block listing ModelName(attr, attr, ...) lines.");
  }
  const models = new Map<string, string[]>();
  for (const line of fencedBlock[1]!.split("\n")) {
    const match = line.trim().match(/^(\w+)\(([^)]*)\)$/);
    if (!match) continue;
    const [, modelName, attrsRaw] = match;
    const attrs = attrsRaw!
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    models.set(modelName!, attrs);
  }
  return models;
}

// KnowledgeItem.embedding is declared in schema.prisma as
// Unsupported("vector(1536)") because Prisma has no native pgvector type.
// Prisma deliberately omits Unsupported() fields from the generated
// Client's field list entirely — they exist in the database (verified at
// the SQL level by migration-constraints.spec.ts, which checks the column
// and its ivfflat index directly) but are not reachable through
// `prisma.knowledgeItem.*` at all; every read/write goes through
// `$queryRaw`/`$executeRaw` instead (see apps/api's KnowledgeItem usage
// once Module 8 lands, and prisma/seed.ts today). A2.5 asks whether a
// documented attribute "exists in the generated Prisma client type"; for
// this one field, by Prisma's own design, the honest answer is "in the
// database, yes; as a queryable Client field, no" — so it is excluded here
// rather than asserted against a field list it can never appear in.
const KNOWN_UNSUPPORTED_TYPE_FIELDS = new Set(["KnowledgeItem.embedding"]);

describe("Schema parity: docs/adr/data-model.md vs the generated Prisma Client (A2.5)", () => {
  const doc = readFileSync(join(__dirname, "../../docs/adr/data-model.md"), "utf-8");
  const documentedModels = parseDataModelDoc(doc);
  const dmmfModelsByName = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));

  it("the doc actually lists every Section 5 entity (sanity check on the parser itself)", () => {
    expect(documentedModels.size).toBeGreaterThanOrEqual(18);
  });

  for (const [modelName, attributes] of documentedModels) {
    it(`${modelName}: every documented attribute exists on the generated Prisma Client model`, () => {
      const dmmfModel = dmmfModelsByName.get(modelName);
      expect(dmmfModel, `Model "${modelName}" is documented but missing from the Prisma Client`).toBeDefined();

      const actualFieldNames = new Set(dmmfModel!.fields.map((f) => f.name));
      for (const attribute of attributes) {
        if (KNOWN_UNSUPPORTED_TYPE_FIELDS.has(`${modelName}.${attribute}`)) {
          continue;
        }
        expect(
          actualFieldNames.has(attribute),
          `${modelName}.${attribute} is documented in data-model.md but missing from the generated Prisma Client`,
        ).toBe(true);
      }
    });
  }
});
