/**
 * Content Converter
 * Converts Anthropic message content to Google Generative AI parts format
 */

import { MIN_SIGNATURE_LENGTH, GEMINI_SKIP_SIGNATURE } from "../constants.js";
import { getCachedSignature, getCachedSignatureFamily } from "./signature-cache.js";
import { getLogger } from "../utils/logger-new.js";
import type { AnthropicContentBlock, GooglePart } from "./types.js";

/**
 * Convert Anthropic role to Google role
 * @param role - Anthropic role ('user', 'assistant')
 * @returns Google role ('user', 'model')
 */
export function convertRole(role: string): "user" | "model" {
  if (role === "assistant") return "model";
  if (role === "user") return "user";
  return "user"; // Default to user
}

/**
 * Convert Anthropic message content to Google Generative AI parts
 * @param content - Anthropic message content
 * @param isClaudeModel - Whether the model is a Claude model
 * @param isGeminiModel - Whether the model is a Gemini model
 * @returns Google Generative AI parts array
 */
export function convertContentToParts(content: string | AnthropicContentBlock[], isClaudeModel = false, isGeminiModel = false): GooglePart[] {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  if (!Array.isArray(content)) {
    return [{ text: String(content) }];
  }

  const parts: GooglePart[] = [];

  for (const block of content) {
    if (!block) continue;

    if (block.type === "text") {
      // Skip empty text blocks - they cause API errors
      if (block.text?.trim()) {
        parts.push({ text: block.text });
      }
    } else if (block.type === "image") {
      // Handle image content
      const source = block.source;
      if (source?.type === "base64") {
        // Base64-encoded image
        parts.push({
          inlineData: {
            mimeType: source.media_type,
            data: source.data!,
          },
        });
      } else if (source?.type === "url") {
        // URL-referenced image
        parts.push({
          fileData: {
            mimeType: source.media_type || "image/jpeg",
            fileUri: source.url!,
          },
        });
      }
    } else if (block.type === "document") {
      // Handle document content (e.g. PDF)
      const source = block.source;
      if (source?.type === "base64") {
        parts.push({
          inlineData: {
            mimeType: source.media_type,
            data: source.data!,
          },
        });
      } else if (source?.type === "url") {
        parts.push({
          fileData: {
            mimeType: source.media_type || "application/pdf",
            fileUri: source.url!,
          },
        });
      }
    } else if (block.type === "tool_use") {
      // Convert tool_use to functionCall (Google format)
      // For Claude models, include the id field
      const functionCall: { name: string; args: Record<string, unknown>; id?: string } = {
        name: block.name,
        args: block.input || {},
      };

      if (isClaudeModel && block.id) {
        functionCall.id = block.id;
      }

      // Build the part with functionCall
      const part: { functionCall: typeof functionCall; thoughtSignature?: string } = { functionCall };

      // For Gemini models, include thoughtSignature at the part level
      // This is required by Gemini 3+ for tool calls to work correctly
      if (isGeminiModel) {
        // Priority: block.thoughtSignature > cache > GEMINI_SKIP_SIGNATURE
        let signature = block.thoughtSignature;

        if (!signature && block.id) {
          const cachedSig = getCachedSignature(block.id);
          if (cachedSig) {
            signature = cachedSig;
            getLogger().debug(`[ContentConverter] Restored signature from cache for: ${block.id}`);
          }
        }

        part.thoughtSignature = signature ?? GEMINI_SKIP_SIGNATURE;
      }

      parts.push(part);
    } else if (block.type === "tool_result") {
      // Convert tool_result to functionResponse (Google format)
      let responseContent: Record<string, unknown>;
      const imageParts: GooglePart[] = [];

      if (typeof block.content === "string") {
        responseContent = { result: block.content };
      } else if (Array.isArray(block.content)) {
        // Extract images from tool results first (e.g., from Read tool reading image files)
        for (const item of block.content) {
          if (item.type === "image" && item.source?.type === "base64") {
            imageParts.push({
              inlineData: {
                mimeType: item.source.media_type,
                data: item.source.data!,
              },
            });
          }
        }

        // Extract text content
        const texts = block.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        responseContent = { result: texts || (imageParts.length > 0 ? "Image attached" : "") };
      } else {
        responseContent = { result: "" };
      }

      const functionResponse: { name: string; response: Record<string, unknown>; id?: string } = {
        name: block.tool_use_id || "unknown",
        response: responseContent,
      };

      // For Claude models, the id field must match the tool_use_id
      if (isClaudeModel && block.tool_use_id) {
        functionResponse.id = block.tool_use_id;
      }

      parts.push({ functionResponse });

      // Add any images from the tool result as separate parts
      parts.push(...imageParts);
    } else if (block.type === "thinking") {
      // Handle thinking blocks with signature compatibility check
      if (block.signature && block.signature.length >= MIN_SIGNATURE_LENGTH) {
        const signatureFamily = getCachedSignatureFamily(block.signature);
        const targetFamily = isClaudeModel ? "claude" : isGeminiModel ? "gemini" : null;

        // Drop blocks with incompatible signatures for Gemini (cross-model switch)
        if (isGeminiModel && signatureFamily && targetFamily && signatureFamily !== targetFamily) {
          getLogger().debug(`[ContentConverter] Dropping incompatible ${signatureFamily} thinking for ${targetFamily} model`);
          continue;
        }

        // Drop blocks with unknown signature origin for Gemini (cold cache - safe default)
        if (isGeminiModel && !signatureFamily && targetFamily) {
          getLogger().debug(`[ContentConverter] Dropping thinking with unknown signature origin`);
          continue;
        }

        // Compatible - convert to Gemini format with signature
        parts.push({
          text: block.thinking,
          thought: true,
          thoughtSignature: block.signature,
        });
      }
      // Unsigned thinking blocks are dropped (existing behavior)
    }
  }

  return parts;
}
