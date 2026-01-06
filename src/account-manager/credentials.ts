/**
 * Credentials Management
 *
 * Handles OAuth token handling and project discovery.
 */

import { ANTIGRAVITY_DB_PATH, TOKEN_REFRESH_INTERVAL_MS, ANTIGRAVITY_ENDPOINT_FALLBACKS, ANTIGRAVITY_HEADERS, DEFAULT_PROJECT_ID } from "../constants.js";
import { refreshAccessToken } from "../auth/oauth.js";
import { getAuthStatus } from "../auth/database.js";
import { getLogger } from "../utils/logger-new.js";
import { isNetworkError } from "../utils/helpers.js";
import type { Account, TokenCacheEntry, OnInvalidCallback, OnSaveCallback } from "./types.js";

/**
 * Get OAuth token for an account
 *
 * @param account - Account object with email and credentials
 * @param tokenCache - Token cache map
 * @param onInvalid - Callback when account is invalid (email, reason)
 * @param onSave - Callback to save changes
 * @returns OAuth access token
 * @throws If token refresh fails
 */
export async function getTokenForAccount(account: Account, tokenCache: Map<string, TokenCacheEntry>, onInvalid: OnInvalidCallback | undefined, onSave: OnSaveCallback | undefined): Promise<string> {
  // Check cache first
  const cached = tokenCache.get(account.email);
  if (cached && Date.now() - cached.extractedAt < TOKEN_REFRESH_INTERVAL_MS) {
    return cached.token;
  }

  // Get fresh token based on source
  let token: string;

  if (account.source === "oauth" && account.refreshToken) {
    // OAuth account - use refresh token to get new access token
    try {
      const tokens = await refreshAccessToken(account.refreshToken);
      token = tokens.accessToken;
      // Clear invalid flag on success
      if (account.isInvalid) {
        account.isInvalid = false;
        account.invalidReason = null;
        if (onSave) await onSave();
      }
      getLogger().info(`[AccountManager] Refreshed OAuth token for: ${account.email}`);
    } catch (error) {
      const err = error as Error;
      // Check if it's a transient network error
      if (isNetworkError(err)) {
        getLogger().warn(`[AccountManager] Failed to refresh token for ${account.email} due to network error: ${err.message}`);
        // Do NOT mark as invalid, just throw so caller knows it failed
        throw new Error(`AUTH_NETWORK_ERROR: ${err.message}`);
      }

      getLogger().error({ email: account.email, error: err.message }, `[AccountManager] Failed to refresh token for ${account.email}`);
      // Mark account as invalid (credentials need re-auth)
      if (onInvalid) onInvalid(account.email, err.message);
      throw new Error(`AUTH_INVALID: ${account.email}: ${err.message}`);
    }
  } else if (account.source === "manual" && account.apiKey) {
    token = account.apiKey;
  } else {
    // Extract from database
    const dbPath = account.dbPath ?? ANTIGRAVITY_DB_PATH;
    const authData = getAuthStatus(dbPath);
    token = authData.apiKey;
  }

  // Cache the token
  tokenCache.set(account.email, {
    token,
    extractedAt: Date.now(),
  });

  return token;
}

/**
 * Project discovery response type
 */
interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string | { id: string };
}

/**
 * Get project ID for an account
 *
 * @param account - Account object
 * @param token - OAuth access token
 * @param projectCache - Project cache map
 * @returns Project ID
 */
export async function getProjectForAccount(account: Account, token: string, projectCache: Map<string, string>): Promise<string> {
  // Check cache first
  const cached = projectCache.get(account.email);
  if (cached) {
    return cached;
  }

  // OAuth or manual accounts may have projectId specified
  if (account.projectId) {
    projectCache.set(account.email, account.projectId);
    return account.projectId;
  }

  // Discover project via loadCodeAssist API
  const project = await discoverProject(token);
  projectCache.set(account.email, project);
  return project;
}

/**
 * Discover project ID via Cloud Code API
 *
 * @param token - OAuth access token
 * @returns Project ID
 */
export async function discoverProject(token: string): Promise<string> {
  for (const endpoint of ANTIGRAVITY_ENDPOINT_FALLBACKS) {
    try {
      const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...ANTIGRAVITY_HEADERS,
        },
        body: JSON.stringify({
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        getLogger().warn(`[AccountManager] Project discovery failed at ${endpoint}: ${response.status} - ${errorText}`);
        continue;
      }

      const data = (await response.json()) as LoadCodeAssistResponse;

      if (typeof data.cloudaicompanionProject === "string") {
        getLogger().info(`[AccountManager] Discovered project: ${data.cloudaicompanionProject}`);
        return data.cloudaicompanionProject;
      }
      if (data.cloudaicompanionProject?.id) {
        getLogger().info(`[AccountManager] Discovered project: ${data.cloudaicompanionProject.id}`);
        return data.cloudaicompanionProject.id;
      }
    } catch (error) {
      const err = error as Error;
      getLogger().warn({ endpoint, error: err.message }, "[AccountManager] Project discovery failed");
    }
  }

  getLogger().warn(`[AccountManager] Project discovery failed for all endpoints. Using default project: ${DEFAULT_PROJECT_ID}`);
  getLogger().warn(`[AccountManager] If you see 404 errors, your account may not have Gemini Code Assist enabled.`);
  return DEFAULT_PROJECT_ID;
}

/**
 * Clear project cache for an account
 *
 * @param projectCache - Project cache map
 * @param email - Email to clear cache for, or null to clear all
 */
export function clearProjectCache(projectCache: Map<string, string>, email: string | null = null): void {
  if (email) {
    projectCache.delete(email);
  } else {
    projectCache.clear();
  }
}

/**
 * Clear token cache for an account
 *
 * @param tokenCache - Token cache map
 * @param email - Email to clear cache for, or null to clear all
 */
export function clearTokenCache(tokenCache: Map<string, TokenCacheEntry>, email: string | null = null): void {
  if (email) {
    tokenCache.delete(email);
  } else {
    tokenCache.clear();
  }
}
