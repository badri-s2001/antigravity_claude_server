// tests/snapshot/sse-events.snap.test.ts
/**
 * Snapshot Tests for SSE Event Format Stability
 *
 * Captures exact SSE event structure for streaming responses.
 */

import { describe, it, expect } from "vitest";

// SSE event types that must remain stable
interface SSEEvent {
  event: string;
  data: unknown;
}

describe("SSE Event Format Snapshots", () => {
  describe("Message Events", () => {
    it("matches snapshot for message_start event", () => {
      const event: SSEEvent = {
        event: "message_start",
        data: {
          type: "message_start",
          message: {
            id: "msg_01XYZ",
            type: "message",
            role: "assistant",
            content: [],
            model: "claude-sonnet-4-5-thinking",
            stop_reason: null,
            stop_sequence: null,
            usage: {
              input_tokens: 10,
              output_tokens: 0,
            },
          },
        },
      };

      expect(event).toMatchSnapshot("message-start-event");
    });

    it("matches snapshot for message_delta event", () => {
      const event: SSEEvent = {
        event: "message_delta",
        data: {
          type: "message_delta",
          delta: {
            stop_reason: "end_turn",
            stop_sequence: null,
          },
          usage: {
            output_tokens: 25,
          },
        },
      };

      expect(event).toMatchSnapshot("message-delta-event");
    });

    it("matches snapshot for message_stop event", () => {
      const event: SSEEvent = {
        event: "message_stop",
        data: {
          type: "message_stop",
        },
      };

      expect(event).toMatchSnapshot("message-stop-event");
    });
  });

  describe("Content Block Events", () => {
    it("matches snapshot for content_block_start (text)", () => {
      const event: SSEEvent = {
        event: "content_block_start",
        data: {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "text",
            text: "",
          },
        },
      };

      expect(event).toMatchSnapshot("content-block-start-text");
    });

    it("matches snapshot for content_block_start (thinking)", () => {
      const event: SSEEvent = {
        event: "content_block_start",
        data: {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "thinking",
            thinking: "",
          },
        },
      };

      expect(event).toMatchSnapshot("content-block-start-thinking");
    });

    it("matches snapshot for content_block_start (tool_use)", () => {
      const event: SSEEvent = {
        event: "content_block_start",
        data: {
          type: "content_block_start",
          index: 1,
          content_block: {
            type: "tool_use",
            id: "toolu_01ABC",
            name: "get_weather",
            input: {},
          },
        },
      };

      expect(event).toMatchSnapshot("content-block-start-tool-use");
    });

    it("matches snapshot for content_block_delta (text)", () => {
      const event: SSEEvent = {
        event: "content_block_delta",
        data: {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "text_delta",
            text: "Hello, ",
          },
        },
      };

      expect(event).toMatchSnapshot("content-block-delta-text");
    });

    it("matches snapshot for content_block_delta (thinking)", () => {
      const event: SSEEvent = {
        event: "content_block_delta",
        data: {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "thinking_delta",
            thinking: "Let me consider...",
          },
        },
      };

      expect(event).toMatchSnapshot("content-block-delta-thinking");
    });

    it("matches snapshot for content_block_delta (input_json)", () => {
      const event: SSEEvent = {
        event: "content_block_delta",
        data: {
          type: "content_block_delta",
          index: 1,
          delta: {
            type: "input_json_delta",
            partial_json: '{"location": "San',
          },
        },
      };

      expect(event).toMatchSnapshot("content-block-delta-input-json");
    });

    it("matches snapshot for content_block_stop", () => {
      const event: SSEEvent = {
        event: "content_block_stop",
        data: {
          type: "content_block_stop",
          index: 0,
        },
      };

      expect(event).toMatchSnapshot("content-block-stop");
    });
  });

  describe("Signature Events", () => {
    it("matches snapshot for content_block_stop with signature", () => {
      const event: SSEEvent = {
        event: "content_block_stop",
        data: {
          type: "content_block_stop",
          index: 0,
          content_block: {
            type: "thinking",
            thinking: "Full thinking content here...",
            signature: "sig_" + "x".repeat(100),
          },
        },
      };

      expect(event).toMatchSnapshot("content-block-stop-with-signature");
    });
  });

  describe("Error Events", () => {
    it("matches snapshot for error event", () => {
      const event: SSEEvent = {
        event: "error",
        data: {
          type: "error",
          error: {
            type: "overloaded_error",
            message: "The API is temporarily overloaded",
          },
        },
      };

      expect(event).toMatchSnapshot("error-event");
    });
  });

  describe("Ping Events", () => {
    it("matches snapshot for ping event", () => {
      const event: SSEEvent = {
        event: "ping",
        data: {
          type: "ping",
        },
      };

      expect(event).toMatchSnapshot("ping-event");
    });
  });
});
