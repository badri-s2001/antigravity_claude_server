/**
 * Account Manager
 * Manages multiple Antigravity accounts with sticky selection,
 * automatic failover, and smart cooldown for rate-limited accounts.
 */

import { ACCOUNT_CONFIG_PATH } from "../constants.js";
import { loadAccounts, loadDefaultAccount, saveAccounts } from "./storage.js";
import { isAllRateLimited as checkAllRateLimited, getAvailableAccounts as getAvailable, getInvalidAccounts as getInvalid, clearExpiredLimits as clearLimits, resetAllRateLimits as resetLimits, markRateLimited as markLimited, markInvalid as markAccountInvalid, getMinWaitTimeMs as getMinWait } from "./rate-limits.js";
import { getTokenForAccount as fetchToken, getProjectForAccount as fetchProject, clearProjectCache as clearProject, clearTokenCache as clearToken } from "./credentials.js";
import { pickNext as selectNext, getCurrentStickyAccount as getSticky, shouldWaitForCurrentAccount as shouldWait, pickStickyAccount as selectSticky } from "./selection.js";
import { getLogger } from "../utils/logger-new.js";
import type { Account, AccountSettings, TokenCacheEntry, AccountManagerStatus, AccountStatus, ShouldWaitResult } from "./types.js";

// Re-export types for external consumers
export type { Account, AccountSettings, AccountManagerStatus, AccountStatus, TokenCacheEntry } from "./types.js";

/**
 * Result of pickStickyAccount method
 */
export interface PickStickyAccountResult {
  account: Account | null;
  waitMs: number;
}

export class AccountManager {
  #accounts: Account[] = [];
  #currentIndex = 0;
  #configPath: string;
  #settings: AccountSettings = {};
  #initialized = false;

  // Per-account caches
  #tokenCache = new Map<string, TokenCacheEntry>(); // email -> { token, extractedAt }
  #projectCache = new Map<string, string>(); // email -> projectId

  constructor(configPath: string = ACCOUNT_CONFIG_PATH) {
    this.#configPath = configPath;
  }

  /**
   * Initialize the account manager by loading config
   */
  async initialize(): Promise<void> {
    if (this.#initialized) return;

    const { accounts, settings, activeIndex } = await loadAccounts(this.#configPath);

    this.#accounts = accounts;
    this.#settings = settings;
    this.#currentIndex = activeIndex;

    // If config exists but has no accounts, fall back to Antigravity database
    if (this.#accounts.length === 0) {
      getLogger().warn("[AccountManager] No accounts in config. Falling back to Antigravity database");
      const { accounts: defaultAccounts, tokenCache } = loadDefaultAccount();
      this.#accounts = defaultAccounts;
      this.#tokenCache = tokenCache;
    }

    // Clear any expired rate limits
    this.clearExpiredLimits();

    this.#initialized = true;
  }

  /**
   * Get the number of accounts
   * @returns Number of configured accounts
   */
  getAccountCount(): number {
    return this.#accounts.length;
  }

  /**
   * Check if all accounts are rate-limited
   * @param modelId - Optional model ID
   * @returns True if all accounts are rate-limited
   */
  isAllRateLimited(modelId: string | null = null): boolean {
    return checkAllRateLimited(this.#accounts, modelId);
  }

  /**
   * Get list of available (non-rate-limited, non-invalid) accounts
   * @param modelId - Optional model ID
   * @returns Array of available account objects
   */
  getAvailableAccounts(modelId: string | null = null): Account[] {
    return getAvailable(this.#accounts, modelId);
  }

  /**
   * Get list of invalid accounts
   * @returns Array of invalid account objects
   */
  getInvalidAccounts(): Account[] {
    return getInvalid(this.#accounts);
  }

  /**
   * Clear expired rate limits
   * @returns Number of rate limits cleared
   */
  clearExpiredLimits(): number {
    const cleared = clearLimits(this.#accounts);
    if (cleared > 0) {
      void this.saveToDisk();
    }
    return cleared;
  }

  /**
   * Clear all rate limits to force a fresh check
   * (Optimistic retry strategy)
   */
  resetAllRateLimits(): void {
    resetLimits(this.#accounts);
  }

  /**
   * Pick the next available account (fallback when current is unavailable).
   * Sets activeIndex to the selected account's index.
   * @param modelId - Optional model ID
   * @returns The next available account or null if none available
   */
  pickNext(modelId: string | null = null): Account | null {
    const { account, newIndex } = selectNext(this.#accounts, this.#currentIndex, () => this.saveToDisk(), modelId);
    this.#currentIndex = newIndex;
    return account;
  }

  /**
   * Get the current account without advancing the index (sticky selection).
   * Used for cache continuity - sticks to the same account until rate-limited.
   * @param modelId - Optional model ID
   * @returns The current account or null if unavailable/rate-limited
   */
  getCurrentStickyAccount(modelId: string | null = null): Account | null {
    const { account, newIndex } = getSticky(this.#accounts, this.#currentIndex, () => this.saveToDisk(), modelId);
    this.#currentIndex = newIndex;
    return account;
  }

  /**
   * Check if we should wait for the current account's rate limit to reset.
   * Used for sticky account selection - wait if rate limit is short (<= threshold).
   * @param modelId - Optional model ID
   * @returns Whether to wait, how long, and which account
   */
  shouldWaitForCurrentAccount(modelId: string | null = null): ShouldWaitResult {
    return shouldWait(this.#accounts, this.#currentIndex, modelId);
  }

  /**
   * Pick an account with sticky selection preference.
   * Prefers the current account for cache continuity, only switches when:
   * - Current account is rate-limited for > 2 minutes
   * - Current account is invalid
   * @param modelId - Optional model ID
   * @returns Account to use and optional wait time
   */
  pickStickyAccount(modelId: string | null = null): PickStickyAccountResult {
    const { account, waitMs, newIndex } = selectSticky(this.#accounts, this.#currentIndex, () => this.saveToDisk(), modelId);
    this.#currentIndex = newIndex;
    return { account, waitMs };
  }

  /**
   * Mark an account as rate-limited
   * @param email - Email of the account to mark
   * @param resetMs - Time in ms until rate limit resets (optional)
   * @param modelId - Optional model ID to mark specific limit
   */
  markRateLimited(email: string, resetMs: number | null = null, modelId: string | null = null): void {
    if (modelId) {
      markLimited(this.#accounts, email, resetMs, this.#settings, modelId);
      void this.saveToDisk();
    }
  }

  /**
   * Mark an account as invalid (credentials need re-authentication)
   * @param email - Email of the account to mark
   * @param reason - Reason for marking as invalid
   */
  markInvalid(email: string, reason = "Unknown error"): void {
    markAccountInvalid(this.#accounts, email, reason);
    void this.saveToDisk();
  }

  /**
   * Get the minimum wait time until any account becomes available
   * @param modelId - Optional model ID
   * @returns Wait time in milliseconds
   */
  getMinWaitTimeMs(modelId: string | null = null): number {
    return getMinWait(this.#accounts, modelId);
  }

  /**
   * Get OAuth token for an account
   * @param account - Account object with email and credentials
   * @returns OAuth access token
   * @throws If token refresh fails
   */
  async getTokenForAccount(account: Account): Promise<string> {
    return fetchToken(
      account,
      this.#tokenCache,
      (email, reason) => {
        this.markInvalid(email, reason);
      },
      () => this.saveToDisk(),
    );
  }

  /**
   * Get project ID for an account
   * @param account - Account object
   * @param token - OAuth access token
   * @returns Project ID
   */
  async getProjectForAccount(account: Account, token: string): Promise<string> {
    return fetchProject(account, token, this.#projectCache);
  }

  /**
   * Clear project cache for an account (useful on auth errors)
   * @param email - Email to clear cache for, or null to clear all
   */
  clearProjectCache(email: string | null = null): void {
    clearProject(this.#projectCache, email);
  }

  /**
   * Clear token cache for an account (useful on auth errors)
   * @param email - Email to clear cache for, or null to clear all
   */
  clearTokenCache(email: string | null = null): void {
    clearToken(this.#tokenCache, email);
  }

  /**
   * Save current state to disk (async)
   */
  async saveToDisk(): Promise<void> {
    await saveAccounts(this.#configPath, this.#accounts, this.#settings, this.#currentIndex);
  }

  /**
   * Get status object for logging/API
   * @returns Status object with accounts and settings
   */
  getStatus(): AccountManagerStatus {
    const available = this.getAvailableAccounts();
    const invalid = this.getInvalidAccounts();

    // Count accounts that have any active model-specific rate limits
    const rateLimited = this.#accounts.filter((a) => {
      if (!a.modelRateLimits) return false;
      return Object.values(a.modelRateLimits).some((limit) => limit.isRateLimited && limit.resetTime !== null && limit.resetTime > Date.now());
    });

    const accountStatuses: AccountStatus[] = this.#accounts.map((a) => ({
      email: a.email,
      source: a.source,
      modelRateLimits: a.modelRateLimits ?? {},
      isInvalid: a.isInvalid ?? false,
      invalidReason: a.invalidReason ?? null,
      lastUsed: a.lastUsed,
    }));

    return {
      total: this.#accounts.length,
      available: available.length,
      rateLimited: rateLimited.length,
      invalid: invalid.length,
      summary: `${this.#accounts.length} total, ${available.length} available, ${rateLimited.length} rate-limited, ${invalid.length} invalid`,
      accounts: accountStatuses,
    };
  }

  /**
   * Get settings
   * @returns Current settings object
   */
  getSettings(): AccountSettings {
    return { ...this.#settings };
  }

  /**
   * Get all accounts (internal use for quota fetching)
   * Returns the full account objects including credentials
   * @returns Array of account objects
   */
  getAllAccounts(): Account[] {
    return this.#accounts;
  }
}
