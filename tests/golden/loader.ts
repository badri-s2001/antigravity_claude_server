/**
 * Golden File Test Utilities
 *
 * Loads input/expected pairs from tests/golden/cases/
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

export interface GoldenCase {
  name: string;
  input: unknown;
  expected: unknown;
  metadata?: {
    description?: string;
    model?: string;
    addedIn?: string;
  };
}

const GOLDEN_DIR = join(import.meta.dirname, "cases");

/**
 * Load a single golden case by name
 */
export function loadGoldenCase(caseName: string): GoldenCase {
  const caseDir = join(GOLDEN_DIR, caseName);

  if (!existsSync(caseDir)) {
    throw new Error(`Golden case not found: ${caseName}`);
  }

  const inputPath = join(caseDir, "input.json");
  const expectedPath = join(caseDir, "expected.json");
  const metadataPath = join(caseDir, "metadata.json");

  const input = JSON.parse(readFileSync(inputPath, "utf-8"));
  const expected = JSON.parse(readFileSync(expectedPath, "utf-8"));
  const metadata = existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath, "utf-8")) : undefined;

  return { name: caseName, input, expected, metadata };
}

/**
 * Load all golden cases from the cases directory
 */
export function loadAllGoldenCases(): GoldenCase[] {
  if (!existsSync(GOLDEN_DIR)) {
    return [];
  }

  const cases: GoldenCase[] = [];
  const entries = readdirSync(GOLDEN_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        cases.push(loadGoldenCase(entry.name));
      } catch {
        // Skip invalid cases
      }
    }
  }

  return cases;
}

/**
 * Normalize response for comparison (remove dynamic fields)
 */
export function normalizeResponse(response: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...response };

  // Normalize message ID
  if (typeof normalized.id === "string" && normalized.id.startsWith("msg_")) {
    normalized.id = "msg_NORMALIZED";
  }

  // Normalize tool IDs in content
  if (Array.isArray(normalized.content)) {
    normalized.content = normalized.content.map((block: Record<string, unknown>) => {
      if (block.type === "tool_use" && typeof block.id === "string") {
        return { ...block, id: "toolu_NORMALIZED" };
      }
      return block;
    });
  }

  return normalized;
}
