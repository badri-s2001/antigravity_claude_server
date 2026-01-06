/**
 * Rate Limit Management
 *
 * Handles rate limit tracking and state management for accounts.
 * All rate limits are model-specific.
 */

import { DEFAULT_COOLDOWN_MS } from "../constants.js";
import { formatDuration } from "../utils/helpers.js";
import { getLogger } from "../utils/logger-new.js";
import type { Account, AccountSettings, ModelRateLimit } from "./types.js";

/**
 * Check if all accounts are rate-limited for a specific model
 *
 * @param accounts - Array of account objects
 * @param modelId - Model ID to check rate limits for
 * @returns True if all accounts are rate-limited
 */
export function isAllRateLimited(accounts: Account[], modelId: string | null): boolean {
  if (accounts.length === 0) return true;
  if (!modelId) return false; // No model specified = not rate limited

  return accounts.every((acc) => {
    if (acc.isInvalid) return true; // Invalid accounts count as unavailable
    const modelLimits = acc.modelRateLimits ?? {};
    const limit = modelLimits[modelId];
    return limit?.isRateLimited && limit.resetTime !== null && limit.resetTime > Date.now();
  });
}

/**
 * Get list of available (non-rate-limited, non-invalid) accounts for a model
 *
 * @param accounts - Array of account objects
 * @param modelId - Model ID to filter by
 * @returns Array of available account objects
 */
export function getAvailableAccounts(accounts: Account[], modelId: string | null = null): Account[] {
  return accounts.filter((acc) => {
    if (acc.isInvalid) return false;

    if (modelId && acc.modelRateLimits?.[modelId]) {
      const limit = acc.modelRateLimits[modelId];
      if (limit.isRateLimited && limit.resetTime !== null && limit.resetTime > Date.now()) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get list of invalid accounts
 *
 * @param accounts - Array of account objects
 * @returns Array of invalid account objects
 */
export function getInvalidAccounts(accounts: Account[]): Account[] {
  return accounts.filter((acc) => acc.isInvalid);
}

/**
 * Clear expired rate limits
 *
 * @param accounts - Array of account objects
 * @returns Number of rate limits cleared
 */
export function clearExpiredLimits(accounts: Account[]): number {
  const now = Date.now();
  let cleared = 0;

  for (const account of accounts) {
    if (account.modelRateLimits) {
      for (const [modelId, limit] of Object.entries(account.modelRateLimits)) {
        if (limit.isRateLimited && limit.resetTime !== null && limit.resetTime <= now) {
          limit.isRateLimited = false;
          limit.resetTime = null;
          cleared++;
          getLogger().info(`[AccountManager] Rate limit expired for: ${account.email} (model: ${modelId})`);
        }
      }
    }
  }

  return cleared;
}

/**
 * Clear all rate limits to force a fresh check (optimistic retry strategy)
 *
 * @param accounts - Array of account objects
 */
export function resetAllRateLimits(accounts: Account[]): void {
  for (const account of accounts) {
    if (account.modelRateLimits) {
      for (const key of Object.keys(account.modelRateLimits)) {
        account.modelRateLimits[key] = { isRateLimited: false, resetTime: null };
      }
    }
  }
  getLogger().warn("[AccountManager] Reset all rate limits for optimistic retry");
}

/**
 * Mark an account as rate-limited for a specific model
 *
 * @param accounts - Array of account objects
 * @param email - Email of the account to mark
 * @param resetMs - Time in ms until rate limit resets
 * @param settings - Settings object with cooldownDurationMs
 * @param modelId - Model ID to mark rate limit for
 * @returns True if account was found and marked
 */
export function markRateLimited(accounts: Account[], email: string, resetMs: number | null = null, settings: AccountSettings = {}, modelId: string): boolean {
  const account = accounts.find((a) => a.email === email);
  if (!account) return false;

  const cooldownMs = resetMs ?? settings.cooldownDurationMs ?? DEFAULT_COOLDOWN_MS;
  const resetTime = Date.now() + cooldownMs;

  if (!account.modelRateLimits) {
    account.modelRateLimits = {};
  }

  const newLimit: ModelRateLimit = {
    isRateLimited: true,
    resetTime: resetTime,
  };
  account.modelRateLimits[modelId] = newLimit;

  getLogger().warn(`[AccountManager] Rate limited: ${email} (model: ${modelId}). Available in ${formatDuration(cooldownMs)}`);

  return true;
}

/**
 * Mark an account as invalid (credentials need re-authentication)
 *
 * @param accounts - Array of account objects
 * @param email - Email of the account to mark
 * @param reason - Reason for marking as invalid
 * @returns True if account was found and marked
 */
export function markInvalid(accounts: Account[], email: string, reason = "Unknown error"): boolean {
  const account = accounts.find((a) => a.email === email);
  if (!account) return false;

  account.isInvalid = true;
  account.invalidReason = reason;
  account.invalidAt = Date.now();

  getLogger().error(`[AccountManager] Account INVALID: ${email}`);
  getLogger().error(`[AccountManager]   Reason: ${reason}`);
  getLogger().error(`[AccountManager]   Run 'npm run accounts' to re-authenticate this account`);

  return true;
}

/**
 * Get the minimum wait time until any account becomes available for a model
 *
 * @param accounts - Array of account objects
 * @param modelId - Model ID to check
 * @returns Wait time in milliseconds
 */
export function getMinWaitTimeMs(accounts: Account[], modelId: string | null): number {
  if (!isAllRateLimited(accounts, modelId)) return 0;

  const now = Date.now();
  let minWait = Infinity;
  let soonestAccount: Account | null = null;

  for (const account of accounts) {
    if (modelId && account.modelRateLimits?.[modelId]) {
      const limit = account.modelRateLimits[modelId];
      if (limit.isRateLimited && limit.resetTime !== null) {
        const wait = limit.resetTime - now;
        if (wait > 0 && wait < minWait) {
          minWait = wait;
          soonestAccount = account;
        }
      }
    }
  }

  if (soonestAccount) {
    getLogger().info(`[AccountManager] Shortest wait: ${formatDuration(minWait)} (account: ${soonestAccount.email})`);
  }

  return minWait === Infinity ? DEFAULT_COOLDOWN_MS : minWait;
}
