/**
 * Type Tests: Exported Types
 *
 * Verifies that exported types are correctly shaped.
 * These tests run at compile time, not runtime.
 */

import { describe, it, expectTypeOf } from "vitest";
import type { AnthropicRequest, AnthropicResponse, AnthropicContentBlock, AnthropicTextBlock, AnthropicThinkingBlock, AnthropicToolUseBlock, GoogleResponse } from "../../src/format/types.js";

describe("Type Tests: Format Types", () => {
  describe("AnthropicRequest", () => {
    it("has required model field as string", () => {
      expectTypeOf<AnthropicRequest>().toHaveProperty("model");
      expectTypeOf<AnthropicRequest["model"]>().toBeString();
    });

    it("has required messages array", () => {
      expectTypeOf<AnthropicRequest>().toHaveProperty("messages");
      expectTypeOf<AnthropicRequest["messages"]>().toBeArray();
    });

    it("has optional max_tokens as number", () => {
      expectTypeOf<AnthropicRequest>().toHaveProperty("max_tokens");
    });
  });

  describe("AnthropicResponse", () => {
    it("has required id field as string", () => {
      expectTypeOf<AnthropicResponse>().toHaveProperty("id");
      expectTypeOf<AnthropicResponse["id"]>().toBeString();
    });

    it("has type field as literal 'message'", () => {
      expectTypeOf<AnthropicResponse>().toHaveProperty("type");
    });

    it("has role field as literal 'assistant'", () => {
      expectTypeOf<AnthropicResponse>().toHaveProperty("role");
    });

    it("has content array", () => {
      expectTypeOf<AnthropicResponse>().toHaveProperty("content");
      expectTypeOf<AnthropicResponse["content"]>().toBeArray();
    });

    it("has usage object", () => {
      expectTypeOf<AnthropicResponse>().toHaveProperty("usage");
      expectTypeOf<AnthropicResponse["usage"]>().toBeObject();
    });
  });

  describe("AnthropicContentBlock union type", () => {
    it("includes AnthropicTextBlock", () => {
      expectTypeOf<AnthropicTextBlock>().toMatchTypeOf<AnthropicContentBlock>();
    });

    it("includes AnthropicThinkingBlock", () => {
      expectTypeOf<AnthropicThinkingBlock>().toMatchTypeOf<AnthropicContentBlock>();
    });

    it("includes AnthropicToolUseBlock", () => {
      expectTypeOf<AnthropicToolUseBlock>().toMatchTypeOf<AnthropicContentBlock>();
    });
  });

  describe("AnthropicTextBlock", () => {
    it("has type 'text'", () => {
      expectTypeOf<AnthropicTextBlock>().toHaveProperty("type");
    });

    it("has text string", () => {
      expectTypeOf<AnthropicTextBlock>().toHaveProperty("text");
      expectTypeOf<AnthropicTextBlock["text"]>().toBeString();
    });
  });

  describe("AnthropicThinkingBlock", () => {
    it("has type 'thinking'", () => {
      expectTypeOf<AnthropicThinkingBlock>().toHaveProperty("type");
    });

    it("has thinking string", () => {
      expectTypeOf<AnthropicThinkingBlock>().toHaveProperty("thinking");
      expectTypeOf<AnthropicThinkingBlock["thinking"]>().toBeString();
    });

    it("has optional signature string", () => {
      expectTypeOf<AnthropicThinkingBlock>().toHaveProperty("signature");
    });
  });

  describe("AnthropicToolUseBlock", () => {
    it("has type 'tool_use'", () => {
      expectTypeOf<AnthropicToolUseBlock>().toHaveProperty("type");
    });

    it("has id string", () => {
      expectTypeOf<AnthropicToolUseBlock>().toHaveProperty("id");
      expectTypeOf<AnthropicToolUseBlock["id"]>().toBeString();
    });

    it("has name string", () => {
      expectTypeOf<AnthropicToolUseBlock>().toHaveProperty("name");
      expectTypeOf<AnthropicToolUseBlock["name"]>().toBeString();
    });

    it("has input object", () => {
      expectTypeOf<AnthropicToolUseBlock>().toHaveProperty("input");
      expectTypeOf<AnthropicToolUseBlock["input"]>().toBeObject();
    });
  });

  describe("GoogleResponse", () => {
    it("has optional candidates array", () => {
      expectTypeOf<GoogleResponse>().toHaveProperty("candidates");
    });

    it("has optional usageMetadata", () => {
      expectTypeOf<GoogleResponse>().toHaveProperty("usageMetadata");
    });
  });
});
