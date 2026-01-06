/**
 * Model API for Cloud Code
 *
 * Handles model listing and quota retrieval from the Cloud Code API.
 */

import { ANTIGRAVITY_ENDPOINT_FALLBACKS, ANTIGRAVITY_HEADERS, getModelFamily } from "../constants.js";
import { getLogger } from "../utils/logger-new.js";

/**
 * Quota information for a model
 */
export interface QuotaInfo {
  remainingFraction: number | null;
  resetTime: string | null;
}

/**
 * Model data from the API
 */
interface ModelData {
  displayName?: string;
  quotaInfo?: {
    remainingFraction?: number;
    resetTime?: string;
  };
}

/**
 * Response from fetchAvailableModels API
 */
export interface AvailableModelsResponse {
  models?: Record<string, ModelData>;
}

/**
 * Model item in Anthropic format
 */
export interface AnthropicModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  description: string;
}

/**
 * Model list response in Anthropic format
 */
export interface AnthropicModelList {
  object: string;
  data: AnthropicModel[];
}

/**
 * Model quotas map
 */
export type ModelQuotas = Record<string, QuotaInfo>;

/**
 * Check if a model is supported (Claude or Gemini)
 * @param modelId - Model ID to check
 * @returns True if model is supported
 */
function isSupportedModel(modelId: string): boolean {
  const family = getModelFamily(modelId);
  return family === "claude" || family === "gemini";
}

/**
 * List available models in Anthropic API format
 * Fetches models dynamically from the Cloud Code API
 *
 * @param token - OAuth access token
 * @returns List of available models
 */
export async function listModels(token: string): Promise<AnthropicModelList> {
  const data = await fetchAvailableModels(token);
  if (!data?.models) {
    return { object: "list", data: [] };
  }

  const modelList: AnthropicModel[] = Object.entries(data.models)
    .filter(([modelId]) => isSupportedModel(modelId))
    .map(([modelId, modelData]) => ({
      id: modelId,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "anthropic",
      description: modelData.displayName ?? modelId,
    }));

  return {
    object: "list",
    data: modelList,
  };
}

/**
 * Fetch available models with quota info from Cloud Code API
 * Returns model quotas including remaining fraction and reset time
 *
 * @param token - OAuth access token
 * @returns Raw response from fetchAvailableModels API
 */
export async function fetchAvailableModels(token: string): Promise<AvailableModelsResponse> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...ANTIGRAVITY_HEADERS,
  };

  for (const endpoint of ANTIGRAVITY_ENDPOINT_FALLBACKS) {
    try {
      const url = `${endpoint}/v1internal:fetchAvailableModels`;
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        await response.text();
        getLogger().warn(`[CloudCode] fetchAvailableModels error at ${endpoint}: ${response.status}`);
        continue;
      }

      return (await response.json()) as AvailableModelsResponse;
    } catch (error) {
      const err = error as Error;
      getLogger().warn({ endpoint, error: err.message }, "[CloudCode] fetchAvailableModels failed");
    }
  }

  throw new Error("Failed to fetch available models from all endpoints");
}

/**
 * Get model quotas for an account
 * Extracts quota info (remaining fraction and reset time) for each model
 *
 * @param token - OAuth access token
 * @returns Map of modelId -> { remainingFraction, resetTime }
 */
export async function getModelQuotas(token: string): Promise<ModelQuotas> {
  const data = await fetchAvailableModels(token);
  if (!data?.models) return {};

  const quotas: ModelQuotas = {};
  for (const [modelId, modelData] of Object.entries(data.models)) {
    // Only include Claude and Gemini models
    if (!isSupportedModel(modelId)) continue;

    if (modelData.quotaInfo) {
      quotas[modelId] = {
        remainingFraction: modelData.quotaInfo.remainingFraction ?? null,
        resetTime: modelData.quotaInfo.resetTime ?? null,
      };
    }
  }

  return quotas;
}
