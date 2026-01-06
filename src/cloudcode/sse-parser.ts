/**
 * SSE Parser for Cloud Code
 *
 * Parses SSE responses for non-streaming thinking models.
 * Accumulates all parts and returns a single response.
 */

import { convertGoogleToAnthropic } from "../format/index.js";
import { getLogger } from "../utils/logger-new.js";
import type { GoogleResponse, GoogleUsageMetadata, GooglePart, AnthropicResponse } from "../format/types.js";

// Re-export types
export type { AnthropicResponse };

/**
 * Response with readable body stream
 */
interface ReadableResponse {
  body: ReadableStream<Uint8Array>;
}

/**
 * Internal part representation during SSE parsing
 */
interface ParsedPart {
  thought?: boolean;
  text?: string;
  thoughtSignature?: string;
  functionCall?: {
    id?: string;
    name: string;
    args?: Record<string, unknown>;
  };
}

/**
 * Parse SSE response for thinking models and accumulate all parts
 *
 * @param response - The HTTP response with SSE body
 * @param originalModel - The original model name
 * @returns Anthropic-format response object
 */
export async function parseThinkingSSEResponse(response: ReadableResponse, originalModel: string): Promise<AnthropicResponse> {
  let accumulatedThinkingText = "";
  let accumulatedThinkingSignature = "";
  let accumulatedText = "";
  const finalParts: ParsedPart[] = [];
  let usageMetadata: GoogleUsageMetadata = {};
  let finishReason = "STOP";

  const flushThinking = (): void => {
    if (accumulatedThinkingText) {
      finalParts.push({
        thought: true,
        text: accumulatedThinkingText,
        thoughtSignature: accumulatedThinkingSignature,
      });
      accumulatedThinkingText = "";
      accumulatedThinkingSignature = "";
    }
  };

  const flushText = (): void => {
    if (accumulatedText) {
      finalParts.push({ text: accumulatedText });
      accumulatedText = "";
    }
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const jsonText = line.slice(5).trim();
      if (!jsonText) continue;

      try {
        const data = JSON.parse(jsonText) as GoogleResponse;
        const innerResponse = data.response ?? data;

        if (innerResponse.usageMetadata) {
          usageMetadata = innerResponse.usageMetadata;
        }

        const candidates = innerResponse.candidates ?? [];
        const firstCandidate = candidates[0];
        if (firstCandidate?.finishReason) {
          finishReason = firstCandidate.finishReason;
        }

        const parts = firstCandidate?.content?.parts ?? [];
        for (const part of parts) {
          // Check for thought part
          if ("thought" in part && part.thought && "text" in part) {
            flushText();
            accumulatedThinkingText += part.text ?? "";
            if ("thoughtSignature" in part && part.thoughtSignature) {
              accumulatedThinkingSignature = part.thoughtSignature;
            }
          } else if ("functionCall" in part) {
            flushThinking();
            flushText();
            const fcPart = part as { functionCall: { id?: string; name: string; args?: Record<string, unknown> }; thoughtSignature?: string };
            finalParts.push({
              functionCall: fcPart.functionCall,
              thoughtSignature: fcPart.thoughtSignature,
            });
          } else if ("text" in part && part.text !== undefined) {
            if (!part.text) continue;
            flushThinking();
            accumulatedText += part.text;
          }
        }
      } catch (e) {
        const error = e as Error;
        getLogger().debug({ error: error.message, raw: jsonText.slice(0, 100) }, "[CloudCode] SSE parse warning");
      }
    }
  }

  flushThinking();
  flushText();

  // Build the response structure that convertGoogleToAnthropic expects
  const accumulatedResponse: GoogleResponse = {
    candidates: [
      {
        content: {
          parts: finalParts.map((p) => {
            if (p.thought && p.text !== undefined) {
              return { text: p.text, thought: true, thoughtSignature: p.thoughtSignature };
            } else if (p.functionCall) {
              return { functionCall: p.functionCall, thoughtSignature: p.thoughtSignature };
            }
            return { text: p.text ?? "" };
          }) as GooglePart[],
        },
        finishReason,
      },
    ],
    usageMetadata,
  };

  const partTypes = finalParts.map((p) => (p.thought ? "thought" : p.functionCall ? "functionCall" : "text"));
  getLogger().debug({ partTypes }, "[CloudCode] Response received (SSE)");
  if (finalParts.some((p) => p.thought)) {
    const thinkingPart = finalParts.find((p) => p.thought);
    getLogger().debug({ signatureLength: thinkingPart?.thoughtSignature?.length ?? 0 }, "[CloudCode] Thinking signature");
  }

  return convertGoogleToAnthropic(accumulatedResponse, originalModel);
}
