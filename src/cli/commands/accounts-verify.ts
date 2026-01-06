/**
 * accounts verify command
 *
 * Verify account tokens are valid by refreshing them.
 */

import * as p from "@clack/prompts";
import pc from "picocolors";

import { ACCOUNT_CONFIG_PATH } from "../../constants.js";
import { loadAccounts, saveAccounts } from "../../account-manager/storage.js";
import { validateRefreshToken } from "../../auth/oauth.js";
import { symbols, accountTable, type AccountData, type AccountStatus } from "../ui.js";

/**
 * Result of verifying a single account
 */
interface VerifyResult {
  email: string;
  status: "valid" | "expired" | "error";
  message?: string;
  accessToken?: string;
  expiresAt?: number;
}

/**
 * Execute the accounts verify command.
 */
export async function accountsVerifyCommand(): Promise<void> {
  p.intro("Verify Accounts");

  // Load accounts
  const { accounts, settings, activeIndex } = await loadAccounts(ACCOUNT_CONFIG_PATH);

  if (accounts.length === 0) {
    p.log.warn(`${symbols.warning} No accounts configured. Run 'accounts add' to add an account.`);
    p.outro("Nothing to verify");
    return;
  }

  p.log.info(`Found ${accounts.length} account(s) to verify`);

  const results: VerifyResult[] = [];
  const spinner = p.spinner();

  // Verify each account
  for (const account of accounts) {
    // Skip non-OAuth accounts (they don't have refresh tokens)
    if (account.source !== "oauth" || !account.refreshToken) {
      results.push({
        email: account.email,
        status: "error",
        message: "No refresh token (non-OAuth account)",
      });
      continue;
    }

    spinner.start(`Checking ${account.email}...`);

    try {
      const accountInfo = await validateRefreshToken(account.refreshToken);

      // Update account with new token info
      account.isInvalid = false;
      account.invalidReason = null;

      results.push({
        email: account.email,
        status: "valid",
        accessToken: accountInfo.accessToken,
        expiresAt: Date.now() + 3600 * 1000, // 1 hour from now
      });

      spinner.stop(`${symbols.success} ${account.email} - valid`);
    } catch (err) {
      const error = err as Error;
      const errorMessage = error.message;

      // Check for invalid_grant (expired/revoked token)
      if (errorMessage.includes("invalid_grant")) {
        account.isInvalid = true;
        account.invalidReason = "Token expired or revoked";
        account.invalidAt = Date.now();

        results.push({
          email: account.email,
          status: "expired",
          message: "Token expired or revoked",
        });

        spinner.stop(`${symbols.error} ${account.email} - expired`);
      } else {
        account.isInvalid = true;
        account.invalidReason = errorMessage;
        account.invalidAt = Date.now();

        results.push({
          email: account.email,
          status: "error",
          message: errorMessage,
        });

        spinner.stop(`${symbols.error} ${account.email} - error`);
      }
    }
  }

  // Save updated accounts
  await saveAccounts(ACCOUNT_CONFIG_PATH, accounts, settings, activeIndex);

  // Display results table
  const tableData: AccountData[] = results.map((r) => {
    let status: AccountStatus;
    if (r.status === "valid") {
      status = "valid";
    } else if (r.status === "expired") {
      status = "expired";
    } else {
      status = "unknown";
    }

    const matchingAccount = accounts.find((a) => a.email === r.email);
    const lastUsedTimestamp = matchingAccount?.lastUsed;

    return {
      email: r.email,
      status,
      lastUsed: lastUsedTimestamp ? new Date(lastUsedTimestamp) : undefined,
    };
  });

  console.log();
  console.log(accountTable(tableData));
  console.log();

  // Count results
  const validCount = results.filter((r) => r.status === "valid").length;
  const expiredCount = results.filter((r) => r.status === "expired").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  // Display summary
  const summary = [pc.green(`Valid: ${validCount}`), pc.yellow(`Expired: ${expiredCount}`), pc.red(`Errors: ${errorCount}`)].join(" | ");

  p.log.info(summary);

  // Show hint if there are expired accounts
  if (expiredCount > 0) {
    p.log.warn(`${symbols.warning} Run 'accounts add' to re-authenticate expired accounts.`);
  }

  p.outro("Verification complete");
}
