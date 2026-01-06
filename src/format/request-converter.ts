/**
 * Request Converter
 * Converts Anthropic Messages API requests to Google Generative AI format
 */

import { GEMINI_MAX_OUTPUT_TOKENS, getModelFamily, isThinkingModel } from "../constants.js";
import { convertContentToParts, convertRole } from "./content-converter.js";
import { sanitizeSchema, cleanSchemaForGemini } from "./schema-sanitizer.js";
import { restoreThinkingSignatures, removeTrailingThinkingBlocks, reorderAssistantContent, filterUnsignedThinkingBlocks, hasGeminiHistory, needsThinkingRecovery, closeToolLoopForThinking } from "./thinking-utils.js";
import { getLogger } from "../utils/logger-new.js";
import type { AnthropicRequest, AnthropicMessage, GoogleRequest, GoogleContent, GooglePart, AnalyzableMessage } from "./types.js";

/**
 * Convert Anthropic Messages API request to the format expected by Cloud Code
 *
 * Uses Google Generative AI format, but for Claude models:
 * - Keeps tool_result in Anthropic format (required by Claude API)
 *
 * @param anthropicRequest - Anthropic format request
 * @returns Request body for Cloud Code API
 */
export function convertAnthropicToGoogle(anthropicRequest: AnthropicRequest): GoogleRequest {
  const { messages, system, max_tokens, temperature, top_p, top_k, stop_sequences, tools, thinking } = anthropicRequest;
  const modelName = anthropicRequest.model || "";
  const modelFamily = getModelFamily(modelName);
  const isClaudeModel = modelFamily === "claude";
  const isGeminiModel = modelFamily === "gemini";
  const isThinking = isThinkingModel(modelName);

  const googleRequest: GoogleRequest = {
    contents: [],
    generationConfig: {},
  };

  // Handle system instruction
  if (system) {
    let systemParts: { text: string }[] = [];
    if (typeof system === "string") {
      systemParts = [{ text: system }];
    } else if (Array.isArray(system)) {
      // Filter for text blocks as system prompts are usually text
      // Anthropic supports text blocks in system prompts
      systemParts = system.filter((block) => block.type === "text").map((block) => ({ text: block.text }));
    }

    if (systemParts.length > 0) {
      googleRequest.systemInstruction = {
        parts: systemParts,
      };
    }
  }

  // Add interleaved thinking hint for Claude thinking models with tools
  if (isClaudeModel && isThinking && tools && tools.length > 0) {
    const hint = "Interleaved thinking is enabled. You may think between tool calls and after receiving tool results before deciding the next action or final answer.";
    if (!googleRequest.systemInstruction) {
      googleRequest.systemInstruction = { parts: [{ text: hint }] };
    } else {
      const lastPart = googleRequest.systemInstruction.parts[googleRequest.systemInstruction.parts.length - 1];
      if (lastPart?.text) {
        lastPart.text = `${lastPart.text}\n\n${hint}`;
      } else {
        googleRequest.systemInstruction.parts.push({ text: hint });
      }
    }
  }

  // Apply thinking recovery for Gemini thinking models when needed
  // Gemini needs recovery for tool loops/interrupted tools (stripped thinking)
  let processedMessages: AnthropicMessage[] | AnalyzableMessage[] = messages;

  if (isGeminiModel && isThinking && needsThinkingRecovery(messages as AnalyzableMessage[])) {
    getLogger().debug("[RequestConverter] Applying thinking recovery for Gemini");
    processedMessages = closeToolLoopForThinking(messages as AnalyzableMessage[], "gemini") as AnthropicMessage[];
  }

  // For Claude: apply recovery only for cross-model (Gemini→Claude) switch
  // Detected by checking if history has Gemini-style tool_use with thoughtSignature
  if (isClaudeModel && isThinking && hasGeminiHistory(messages as AnalyzableMessage[]) && needsThinkingRecovery(messages as AnalyzableMessage[])) {
    getLogger().debug("[RequestConverter] Applying thinking recovery for Claude (cross-model from Gemini)");
    processedMessages = closeToolLoopForThinking(messages as AnalyzableMessage[], "claude") as AnthropicMessage[];
  }

  // Convert messages to contents, then filter unsigned thinking blocks
  for (const msg of processedMessages) {
    let msgContent = msg.content ?? [];

    // For assistant messages, process thinking blocks and reorder content
    if ((msg.role === "assistant" || msg.role === "model") && Array.isArray(msgContent)) {
      // First, try to restore signatures for unsigned thinking blocks from cache
      msgContent = restoreThinkingSignatures(msgContent);
      // Remove trailing unsigned thinking blocks
      msgContent = removeTrailingThinkingBlocks(msgContent);
      // Reorder: thinking first, then text, then tool_use
      msgContent = reorderAssistantContent(msgContent);
    }

    const parts = convertContentToParts(msgContent, isClaudeModel, isGeminiModel);

    // SAFETY: Google API requires at least one part per content message
    // This happens when all thinking blocks are filtered out (unsigned)
    if (parts.length === 0) {
      // Use '.' instead of '' because claude models reject empty text parts.
      // A single period is invisible in practice but satisfies the API requirement.
      getLogger().warn("[RequestConverter] WARNING: Empty parts array after filtering, adding placeholder");
      parts.push({ text: "." });
    }

    const content: GoogleContent = {
      role: convertRole(msg.role),
      parts: parts,
    };
    googleRequest.contents.push(content);
  }

  // Filter unsigned thinking blocks for Claude models
  if (isClaudeModel) {
    googleRequest.contents = filterUnsignedThinkingBlocks(googleRequest.contents as { role: string; parts: GooglePart[] }[]) as GoogleContent[];
  }

  // Generation config
  if (max_tokens) {
    googleRequest.generationConfig.maxOutputTokens = max_tokens;
  }
  if (temperature !== undefined) {
    googleRequest.generationConfig.temperature = temperature;
  }
  if (top_p !== undefined) {
    googleRequest.generationConfig.topP = top_p;
  }
  if (top_k !== undefined) {
    googleRequest.generationConfig.topK = top_k;
  }
  if (stop_sequences && stop_sequences.length > 0) {
    googleRequest.generationConfig.stopSequences = stop_sequences;
  }

  // Enable thinking for thinking models (Claude and Gemini 3+)
  if (isThinking) {
    if (isClaudeModel) {
      // Claude thinking config
      const thinkingConfig: { include_thoughts: boolean; thinking_budget?: number } = {
        include_thoughts: true,
      };

      // Only set thinking_budget if explicitly provided
      const thinkingBudget = thinking?.budget_tokens;
      if (thinkingBudget) {
        thinkingConfig.thinking_budget = thinkingBudget;
        getLogger().debug(`[RequestConverter] Claude thinking enabled with budget: ${thinkingBudget}`);

        // Validate max_tokens > thinking_budget as required by the API
        const currentMaxTokens = googleRequest.generationConfig.maxOutputTokens;
        if (currentMaxTokens && currentMaxTokens <= thinkingBudget) {
          // Bump max_tokens to allow for some response content
          // Default to budget + 8192 (standard output buffer)
          const adjustedMaxTokens = thinkingBudget + 8192;
          getLogger().warn(`[RequestConverter] max_tokens (${currentMaxTokens}) <= thinking_budget (${thinkingBudget}). Adjusting to ${adjustedMaxTokens} to satisfy API requirements`);
          googleRequest.generationConfig.maxOutputTokens = adjustedMaxTokens;
        }
      } else {
        getLogger().debug("[RequestConverter] Claude thinking enabled (no budget specified)");
      }

      googleRequest.generationConfig.thinkingConfig = thinkingConfig;
    } else if (isGeminiModel) {
      // Gemini thinking config (uses camelCase)
      const thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: thinking?.budget_tokens ?? 16000,
      };
      getLogger().debug(`[RequestConverter] Gemini thinking enabled with budget: ${thinkingConfig.thinkingBudget}`);

      googleRequest.generationConfig.thinkingConfig = thinkingConfig;
    }
  }

  // Convert tools to Google format
  if (tools && tools.length > 0) {
    const functionDeclarations = tools.map((tool, idx) => {
      // Extract name from various possible locations
      const name = tool.name ?? tool.function?.name ?? tool.custom?.name ?? `tool-${idx}`;

      // Extract description from various possible locations
      const description = tool.description ?? tool.function?.description ?? tool.custom?.description ?? "";

      // Extract schema from various possible locations
      const schema = tool.input_schema ?? tool.function?.input_schema ?? tool.function?.parameters ?? tool.custom?.input_schema ?? tool.parameters ?? { type: "object" };

      // Sanitize schema for general compatibility
      let parameters = sanitizeSchema(schema);

      // For Gemini models, apply additional cleaning for VALIDATED mode
      if (isGeminiModel) {
        parameters = cleanSchemaForGemini(parameters);
      }

      return {
        name: name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64),
        description: description,
        parameters,
      };
    });

    googleRequest.tools = [{ functionDeclarations }];
    getLogger().debug(`[RequestConverter] Tools: ${JSON.stringify(googleRequest.tools).substring(0, 300)}`);
  }

  // Cap max tokens for Gemini models
  if (isGeminiModel && googleRequest.generationConfig.maxOutputTokens && googleRequest.generationConfig.maxOutputTokens > GEMINI_MAX_OUTPUT_TOKENS) {
    getLogger().debug(`[RequestConverter] Capping Gemini max_tokens from ${googleRequest.generationConfig.maxOutputTokens} to ${GEMINI_MAX_OUTPUT_TOKENS}`);
    googleRequest.generationConfig.maxOutputTokens = GEMINI_MAX_OUTPUT_TOKENS;
  }

  return googleRequest;
}
