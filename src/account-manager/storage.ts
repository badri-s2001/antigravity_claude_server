/**
 * Account Storage
 *
 * Handles loading and saving account configuration to disk.
 */

import { readFile, writeFile, mkdir, access } from "fs/promises";
import { constants as fsConstants } from "fs";
import { dirname } from "path";
import { ACCOUNT_CONFIG_PATH } from "../constants.js";
import { getAuthStatus } from "../auth/database.js";
import { getLogger } from "../utils/logger-new.js";
import type { Account, AccountConfig, AccountSettings, TokenCacheEntry } from "./types.js";

/**
 * Result of loading accounts from config
 */
export interface LoadAccountsResult {
  accounts: Account[];
  settings: AccountSettings;
  activeIndex: number;
}

/**
 * Result of loading default account from database
 */
export interface LoadDefaultAccountResult {
  accounts: Account[];
  tokenCache: Map<string, TokenCacheEntry>;
}

/**
 * Load accounts from the config file
 *
 * @param configPath - Path to the config file
 * @returns Loaded accounts, settings, and active index
 */
export async function loadAccounts(configPath: string = ACCOUNT_CONFIG_PATH): Promise<LoadAccountsResult> {
  try {
    // Check if config file exists using async access
    await access(configPath, fsConstants.F_OK);
    const configData = await readFile(configPath, "utf-8");
    const config = JSON.parse(configData) as AccountConfig;

    const accounts: Account[] = (config.accounts ?? []).map((acc) => ({
      ...acc,
      lastUsed: acc.lastUsed ?? null,
      // Reset invalid flag on startup - give accounts a fresh chance to refresh
      isInvalid: false,
      invalidReason: null,
      modelRateLimits: acc.modelRateLimits ?? {},
    }));

    const settings: AccountSettings = config.settings ?? {};
    let activeIndex = config.activeIndex ?? 0;

    // Clamp activeIndex to valid range
    if (activeIndex >= accounts.length) {
      activeIndex = 0;
    }

    getLogger().info(`[AccountManager] Loaded ${accounts.length} account(s) from config`);

    return { accounts, settings, activeIndex };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      // No config file - return empty
      getLogger().info("[AccountManager] No config file found. Using Antigravity database (single account mode)");
    } else {
      getLogger().error({ error: err.message }, "[AccountManager] Failed to load config");
    }
    return { accounts: [], settings: {}, activeIndex: 0 };
  }
}

/**
 * Load the default account from Antigravity's database
 *
 * @param dbPath - Optional path to the database
 * @returns Loaded accounts and token cache
 */
export function loadDefaultAccount(dbPath?: string): LoadDefaultAccountResult {
  try {
    const authData = getAuthStatus(dbPath);
    if (authData?.apiKey) {
      const account: Account = {
        email: authData.email ?? "default@antigravity",
        source: "database",
        lastUsed: null,
        modelRateLimits: {},
      };

      const tokenCache = new Map<string, TokenCacheEntry>();
      tokenCache.set(account.email, {
        token: authData.apiKey,
        extractedAt: Date.now(),
      });

      getLogger().info(`[AccountManager] Loaded default account: ${account.email}`);

      return { accounts: [account], tokenCache };
    }
  } catch (error) {
    const err = error as Error;
    getLogger().error({ error: err.message }, "[AccountManager] Failed to load default account");
  }

  return { accounts: [], tokenCache: new Map() };
}

/**
 * Save account configuration to disk
 *
 * @param configPath - Path to the config file
 * @param accounts - Array of account objects
 * @param settings - Settings object
 * @param activeIndex - Current active account index
 */
export async function saveAccounts(configPath: string, accounts: Account[], settings: AccountSettings, activeIndex: number): Promise<void> {
  try {
    // Ensure directory exists
    const dir = dirname(configPath);
    await mkdir(dir, { recursive: true });

    const config: AccountConfig = {
      accounts: accounts.map((acc) => ({
        email: acc.email,
        source: acc.source,
        dbPath: acc.dbPath ?? null,
        refreshToken: acc.source === "oauth" ? acc.refreshToken : undefined,
        apiKey: acc.source === "manual" ? acc.apiKey : undefined,
        projectId: acc.projectId,
        addedAt: acc.addedAt,
        isInvalid: acc.isInvalid ?? false,
        invalidReason: acc.invalidReason ?? null,
        modelRateLimits: acc.modelRateLimits ?? {},
        lastUsed: acc.lastUsed,
      })),
      settings: settings,
      activeIndex: activeIndex,
    };

    await writeFile(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    const err = error as Error;
    getLogger().error({ error: err.message }, "[AccountManager] Failed to save config");
  }
}
