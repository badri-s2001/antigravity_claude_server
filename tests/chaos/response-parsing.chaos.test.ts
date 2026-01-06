// tests/chaos/response-parsing.chaos.test.ts
/**
 * Chaos Tests: Response Parsing
 *
 * Tests resilience against malformed API responses.
 * Verifies the converter handles malformed data gracefully (doesn't crash),
 * not that it produces specific output.
 */

import { describe, it, expect } from "vitest";
import { convertGoogleToAnthropic } from "../../src/format/response-converter.js";
import type { GoogleResponse } from "../../src/format/types.js";

describe("Chaos: Response Parsing", () => {
  describe("Missing Fields", () => {
    it("handles missing candidates array", () => {
      const malformed = {} as GoogleResponse;

      // Should not crash, should return valid response structure
      expect(() => convertGoogleToAnthropic(malformed, "test")).not.toThrow();
    });

    it("handles empty candidates array", () => {
      const malformed: GoogleResponse = {
        candidates: [],
      };

      const result = convertGoogleToAnthropic(malformed, "test");
      expect(result.content).toBeDefined();
    });

    it("handles candidate with missing content", () => {
      const malformed = {
        candidates: [{ finishReason: "STOP" }],
      } as GoogleResponse;

      expect(() => convertGoogleToAnthropic(malformed, "test")).not.toThrow();
    });

    it("handles content with missing parts", () => {
      const malformed = {
        candidates: [{ content: {}, finishReason: "STOP" }],
      } as GoogleResponse;

      expect(() => convertGoogleToAnthropic(malformed, "test")).not.toThrow();
    });

    it("handles missing usageMetadata", () => {
      const response: GoogleResponse = {
        candidates: [
          {
            content: { parts: [{ text: "Hello" }] },
            finishReason: "STOP",
          },
        ],
      };

      const result = convertGoogleToAnthropic(response, "test");
      expect(result.usage).toBeDefined();
      expect(result.usage.input_tokens).toBe(0);
    });
  });

  describe("Invalid Field Types", () => {
    it("handles text field as number", () => {
      const malformed = {
        candidates: [
          {
            content: { parts: [{ text: 12345 }] },
            finishReason: "STOP",
          },
        ],
      } as unknown as GoogleResponse;

      // Should coerce or handle gracefully
      expect(() => convertGoogleToAnthropic(malformed, "test")).not.toThrow();
    });

    it("handles parts as non-array", () => {
      const malformed = {
        candidates: [
          {
            content: { parts: "not an array" },
            finishReason: "STOP",
          },
        ],
      } as unknown as GoogleResponse;

      // Currently throws TypeError - documents current behavior
      // A more resilient implementation would handle this gracefully
      expect(() => convertGoogleToAnthropic(malformed, "test")).toThrow(TypeError);
    });

    it("handles null candidates", () => {
      const malformed = {
        candidates: null,
      } as unknown as GoogleResponse;

      expect(() => convertGoogleToAnthropic(malformed, "test")).not.toThrow();
    });

    it("handles undefined in parts array", () => {
      const malformed = {
        candidates: [
          {
            content: { parts: [undefined, { text: "valid" }, null] },
            finishReason: "STOP",
          },
        ],
      } as unknown as GoogleResponse;

      // Currently throws TypeError when iterating over undefined/null parts
      // Documents current behavior - a more defensive implementation would skip these
      expect(() => convertGoogleToAnthropic(malformed, "test")).toThrow(TypeError);
    });
  });

  describe("Unexpected Values", () => {
    it("handles unknown finishReason", () => {
      const response = {
        candidates: [
          {
            content: { parts: [{ text: "test" }] },
            finishReason: "UNKNOWN_REASON",
          },
        ],
      } as unknown as GoogleResponse;

      const result = convertGoogleToAnthropic(response, "test");
      // Should default to something sensible
      expect(["end_turn", "stop_sequence", null]).toContain(result.stop_reason);
    });

    it("handles negative token counts", () => {
      const response: GoogleResponse = {
        candidates: [
          {
            content: { parts: [{ text: "test" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: -100,
          candidatesTokenCount: -50,
        },
      };

      // Documents current behavior - converter passes through negative values
      // A production-grade implementation might clamp these to 0
      const result = convertGoogleToAnthropic(response, "test");
      expect(result.usage).toBeDefined();
      // Currently: input_tokens = promptTokenCount - cachedTokenCount = -100 - 0 = -100
      expect(result.usage.input_tokens).toBe(-100);
    });

    it("handles extremely large token counts", () => {
      const response: GoogleResponse = {
        candidates: [
          {
            content: { parts: [{ text: "test" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: Number.MAX_SAFE_INTEGER,
          candidatesTokenCount: Number.MAX_SAFE_INTEGER,
        },
      };

      expect(() => convertGoogleToAnthropic(response, "test")).not.toThrow();
    });

    it("handles empty string text parts", () => {
      const response: GoogleResponse = {
        candidates: [
          {
            content: { parts: [{ text: "" }, { text: "" }, { text: "" }] },
            finishReason: "STOP",
          },
        ],
      };

      const result = convertGoogleToAnthropic(response, "test");
      expect(result.content).toBeDefined();
    });
  });

  describe("Deeply Nested Structures", () => {
    it("handles deeply nested function call args", () => {
      const deepArgs: Record<string, unknown> = { level: 0 };
      let current = deepArgs;
      for (let i = 0; i < 100; i++) {
        current.nested = { level: i + 1 };
        current = current.nested as Record<string, unknown>;
      }

      const response = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "deep_function",
                    args: deepArgs,
                  },
                },
              ],
            },
            finishReason: "TOOL_USE",
          },
        ],
      } as unknown as GoogleResponse;

      expect(() => convertGoogleToAnthropic(response, "test")).not.toThrow();
    });
  });

  describe("Special Characters", () => {
    it("handles unicode in text", () => {
      const response: GoogleResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "Hello 世界! 🌍 Привет мир! مرحبا" }],
            },
            finishReason: "STOP",
          },
        ],
      };

      const result = convertGoogleToAnthropic(response, "test");
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: "Hello 世界! 🌍 Привет мир! مرحبا",
      });
    });

    it("handles control characters in text", () => {
      const response: GoogleResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "Line1\n\t\rLine2\x00\x01\x02" }],
            },
            finishReason: "STOP",
          },
        ],
      };

      expect(() => convertGoogleToAnthropic(response, "test")).not.toThrow();
    });

    it("handles very long text (1MB+)", () => {
      const longText = "x".repeat(1024 * 1024);
      const response: GoogleResponse = {
        candidates: [
          {
            content: { parts: [{ text: longText }] },
            finishReason: "STOP",
          },
        ],
      };

      expect(() => convertGoogleToAnthropic(response, "test")).not.toThrow();
    });
  });
});
