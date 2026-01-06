/**
 * Token Extractor Module
 * Extracts OAuth tokens from Antigravity's SQLite database
 *
 * The database is automatically updated by Antigravity when tokens refresh,
 * so this approach doesn't require any manual intervention.
 */

import { TOKEN_REFRESH_INTERVAL_MS, ANTIGRAVITY_AUTH_PORT } from "../constants.js";
import { getAuthStatus } from "./database.js";
import { getLogger } from "../utils/logger-new.js";

/**
 * Chat params structure from Antigravity HTML page
 */
interface ChatParams {
  apiKey?: string;
  [key: string]: unknown;
}

// Cache for the extracted token
let cachedToken: string | null = null;
let tokenExtractedAt: number | null = null;

/**
 * Extract the chat params from Antigravity's HTML page (fallback method)
 */
async function extractChatParams(): Promise<ChatParams> {
  try {
    const response = await fetch(`http://127.0.0.1:${ANTIGRAVITY_AUTH_PORT}/`);
    const html = await response.text();

    // Find the base64-encoded chatParams in the HTML
    const match = /window\.chatParams\s*=\s*'([^']+)'/.exec(html);
    if (!match) {
      throw new Error("Could not find chatParams in Antigravity page");
    }

    // Decode base64
    const base64Data = match[1];
    const jsonString = Buffer.from(base64Data, "base64").toString("utf-8");
    const config = JSON.parse(jsonString) as ChatParams;

    return config;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ECONNREFUSED") {
      throw new Error(`Cannot connect to Antigravity on port ${ANTIGRAVITY_AUTH_PORT}. ` + "Make sure Antigravity is running.");
    }
    throw error;
  }
}

/**
 * Get fresh token data - tries DB first, falls back to HTML page
 */
async function getTokenData(): Promise<{ apiKey: string }> {
  // Try database first (preferred - always has fresh token)
  try {
    const dbData = getAuthStatus();
    if (dbData.apiKey) {
      getLogger().info("[Token] Got fresh token from SQLite database");
      return dbData;
    }
  } catch {
    getLogger().warn("[Token] DB extraction failed, trying HTML page...");
  }

  // Fallback to HTML page
  try {
    const pageData = await extractChatParams();
    if (pageData.apiKey) {
      getLogger().warn("[Token] Got token from HTML page (may be stale)");
      return { apiKey: pageData.apiKey };
    }
  } catch (err) {
    const error = err as Error;
    getLogger().warn(`[Token] HTML page extraction failed: ${error.message}`);
  }

  throw new Error("Could not extract token from Antigravity. " + "Make sure Antigravity is running and you are logged in.");
}

/**
 * Check if the cached token needs refresh
 */
function needsRefresh(): boolean {
  if (!cachedToken || !tokenExtractedAt) {
    return true;
  }
  return Date.now() - tokenExtractedAt > TOKEN_REFRESH_INTERVAL_MS;
}

/**
 * Get the current OAuth token (with caching)
 */
export async function getToken(): Promise<string> {
  if (needsRefresh()) {
    const data = await getTokenData();
    cachedToken = data.apiKey;
    tokenExtractedAt = Date.now();
  }
  return cachedToken!;
}

/**
 * Force refresh the token (useful if requests start failing)
 */
export async function forceRefresh(): Promise<string> {
  cachedToken = null;
  tokenExtractedAt = null;
  return getToken();
}
