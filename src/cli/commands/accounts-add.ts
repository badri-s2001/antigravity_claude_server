/**
 * accounts add command
 *
 * Add a new Google account via OAuth or refresh token.
 */

import * as p from "@clack/prompts";
import open from "open";

import { ACCOUNT_CONFIG_PATH, DEFAULT_PORT } from "../../constants.js";
import { loadAccounts, saveAccounts } from "../../account-manager/storage.js";
import { getAuthorizationUrl, startCallbackServer, completeOAuthFlow, validateRefreshToken } from "../../auth/oauth.js";
import type { Account } from "../../account-manager/types.js";
import { symbols, error as errorColor, success as successColor, dim } from "../ui.js";
import { isServerRunning } from "../utils.js";

/**
 * Execute the accounts add command.
 *
 * @param options - Command options
 */
export async function accountsAddCommand(options: { noBrowser?: boolean; refreshToken?: boolean }): Promise<void> {
  p.intro("Add Account");

  // Check if server is running
  const serverRunning = await isServerRunning(DEFAULT_PORT);
  if (serverRunning) {
    p.log.error(`${symbols.error} Server is running on port ${DEFAULT_PORT}. Stop the server before adding accounts.`);
    process.exit(1);
  }

  // Determine auth method
  let authMethod: "oauth" | "refresh-token" = "oauth";

  if (options.refreshToken) {
    authMethod = "refresh-token";
  } else {
    const methodChoice = await p.select({
      message: "Select authentication method:",
      options: [
        { value: "oauth", label: "OAuth Flow", hint: "Opens browser for Google sign-in" },
        { value: "refresh-token", label: "Refresh Token", hint: "Paste an existing refresh token" },
      ],
    });

    if (p.isCancel(methodChoice)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }

    authMethod = methodChoice;
  }

  if (authMethod === "refresh-token") {
    await handleRefreshTokenFlow();
  } else {
    await handleOAuthFlow(options.noBrowser ?? false);
  }
}

/**
 * Handle refresh token authentication flow.
 */
async function handleRefreshTokenFlow(): Promise<void> {
  // Check for REFRESH_TOKEN env var first
  let refreshToken = process.env.REFRESH_TOKEN;

  if (!refreshToken) {
    const tokenInput = await p.text({
      message: "Enter your refresh token:",
      placeholder: "1//...",
      validate: (value) => {
        if (!value) return "Refresh token is required";
        if (!value.startsWith("1//")) return 'Refresh token must start with "1//"';
        return undefined;
      },
    });

    if (p.isCancel(tokenInput)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }

    refreshToken = tokenInput;
  } else {
    p.log.info(`${symbols.info} Using REFRESH_TOKEN from environment`);
  }

  const spinner = p.spinner();
  spinner.start("Validating refresh token...");

  try {
    const accountInfo = await validateRefreshToken(refreshToken);

    spinner.stop(`${symbols.success} Token validated`);

    // Load existing accounts
    const { accounts, settings, activeIndex } = await loadAccounts(ACCOUNT_CONFIG_PATH);

    // Check for duplicate
    const existingIndex = accounts.findIndex((acc) => acc.email === accountInfo.email);
    if (existingIndex !== -1) {
      // Update existing account
      accounts[existingIndex] = {
        ...accounts[existingIndex],
        refreshToken: accountInfo.refreshToken,
        projectId: accountInfo.projectId ?? undefined,
      };
      p.log.info(`${symbols.info} Updated existing account: ${accountInfo.email}`);
    } else {
      // Add new account
      const newAccount: Account = {
        email: accountInfo.email,
        source: "oauth",
        refreshToken: accountInfo.refreshToken,
        projectId: accountInfo.projectId ?? undefined,
        addedAt: Date.now(),
        lastUsed: null,
        modelRateLimits: {},
      };
      accounts.push(newAccount);
    }

    // Save accounts
    await saveAccounts(ACCOUNT_CONFIG_PATH, accounts, settings, activeIndex);

    p.outro(`${successColor("Success!")} Added account ${accountInfo.email}`);
  } catch (err) {
    const error = err as Error;
    spinner.stop(`${symbols.error} Validation failed`);

    // Check for invalid_grant error
    if (error.message.includes("invalid_grant")) {
      p.log.error(errorColor("Token has been revoked or expired. Please re-authenticate."));
    } else {
      p.log.error(errorColor(error.message));
    }

    process.exit(1);
  }
}

/**
 * Handle OAuth browser-based authentication flow.
 *
 * @param noBrowser - If true, display URL for manual navigation
 */
async function handleOAuthFlow(noBrowser: boolean): Promise<void> {
  const authData = getAuthorizationUrl();

  if (noBrowser) {
    p.log.info("Open this URL in your browser to sign in:");
    p.log.message(dim(authData.url));
    p.log.info("After signing in, you will be redirected. The callback will be captured automatically.");
  } else {
    p.log.info(`${symbols.arrow} Opening browser for Google sign-in...`);
    await open(authData.url);
  }

  const spinner = p.spinner();
  spinner.start("Waiting for OAuth callback...");

  try {
    // Start callback server and wait for code
    const code = await startCallbackServer(authData.state);

    spinner.message("Exchanging code for tokens...");

    // Complete the OAuth flow
    const accountInfo = await completeOAuthFlow(code, authData.verifier);

    spinner.stop(`${symbols.success} Authentication successful`);

    // Load existing accounts
    const { accounts, settings, activeIndex } = await loadAccounts(ACCOUNT_CONFIG_PATH);

    // Check for duplicate
    const existingIndex = accounts.findIndex((acc) => acc.email === accountInfo.email);
    if (existingIndex !== -1) {
      // Update existing account
      accounts[existingIndex] = {
        ...accounts[existingIndex],
        refreshToken: accountInfo.refreshToken,
        projectId: accountInfo.projectId ?? undefined,
      };
      p.log.info(`${symbols.info} Updated existing account: ${accountInfo.email}`);
    } else {
      // Add new account
      const newAccount: Account = {
        email: accountInfo.email,
        source: "oauth",
        refreshToken: accountInfo.refreshToken,
        projectId: accountInfo.projectId ?? undefined,
        addedAt: Date.now(),
        lastUsed: null,
        modelRateLimits: {},
      };
      accounts.push(newAccount);
    }

    // Save accounts
    await saveAccounts(ACCOUNT_CONFIG_PATH, accounts, settings, activeIndex);

    p.outro(`${successColor("Success!")} Added account ${accountInfo.email} (${accounts.length} total)`);
  } catch (err) {
    const error = err as Error;
    spinner.stop(`${symbols.error} Authentication failed`);

    // Check for invalid_grant error
    if (error.message.includes("invalid_grant")) {
      p.log.error(errorColor("Authorization code has expired. Please try again."));
    } else {
      p.log.error(errorColor(error.message));
    }

    process.exit(1);
  }
}
