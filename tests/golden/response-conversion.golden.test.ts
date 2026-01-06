/**
 * Golden File Tests for Response Conversion
 *
 * Tests that Google API responses convert to exact expected Anthropic format.
 * Add new cases by creating input.json/expected.json in tests/golden/cases/
 */

import { describe, it, expect } from "vitest";
import { loadAllGoldenCases, normalizeResponse } from "./loader.js";
import { convertGoogleToAnthropic } from "../../src/format/response-converter.js";
import type { GoogleResponse } from "../../src/format/types.js";

describe("Golden File Tests: Response Conversion", () => {
  const cases = loadAllGoldenCases();

  if (cases.length === 0) {
    it.skip("No golden cases found", () => {});
    return;
  }

  for (const goldenCase of cases) {
    it(`converts correctly: ${goldenCase.name}`, () => {
      const model = goldenCase.metadata?.model ?? "claude-sonnet-4-5-thinking";
      const input = goldenCase.input as GoogleResponse;

      const result = convertGoogleToAnthropic(input, model);
      const normalized = normalizeResponse(result as Record<string, unknown>);

      expect(normalized).toEqual(goldenCase.expected);
    });
  }
});
