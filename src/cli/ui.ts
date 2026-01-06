/**
 * CLI UI Utilities Module
 *
 * Provides color helpers, status symbols, and UI components for the CLI.
 */

import pc from "picocolors";
import boxen from "boxen";
import Table from "cli-table3";

// ============================================================================
// Color Helpers
// ============================================================================

/**
 * Green colored text for success messages
 */
export const success = (text: string): string => pc.green(text);

/**
 * Red colored text for error messages
 */
export const error = (text: string): string => pc.red(text);

/**
 * Yellow colored text for warning messages
 */
export const warn = (text: string): string => pc.yellow(text);

/**
 * Blue colored text for info messages
 */
export const info = (text: string): string => pc.blue(text);

/**
 * Dim colored text
 */
export const dim = (text: string): string => pc.dim(text);

/**
 * Bold text
 */
export const bold = (text: string): string => pc.bold(text);

/**
 * Cyan colored text
 */
export const cyan = (text: string): string => pc.cyan(text);

/**
 * Magenta colored text
 */
export const magenta = (text: string): string => pc.magenta(text);

// ============================================================================
// Status Symbols
// ============================================================================

/**
 * Status symbols with color styling
 */
export const symbols = {
  /** Green checkmark */
  success: pc.green("\u2714"),
  /** Red X */
  error: pc.red("\u2718"),
  /** Yellow warning symbol */
  warning: pc.yellow("\u26A0"),
  /** Blue info symbol */
  info: pc.blue("\u2139"),
  /** Cyan arrow */
  arrow: pc.cyan("\u2192"),
  /** Dim bullet */
  bullet: pc.dim("\u2022"),
} as const;

// ============================================================================
// UI Components
// ============================================================================

/**
 * Account status type
 */
export type AccountStatus = "valid" | "rate-limited" | "expired" | "unknown";

/**
 * Account data for table display
 */
export interface AccountData {
  email: string;
  status: AccountStatus;
  lastUsed?: Date;
}

/**
 * Creates a boxed banner with title and version
 *
 * @param title - The application title
 * @param version - The version string
 * @param subtitle - Optional subtitle text
 * @returns Formatted banner string
 */
export function banner(title: string, version: string, subtitle?: string): string {
  const titleLine = `${pc.bold(pc.cyan(title))} ${pc.dim(version)}`;
  const content = subtitle ? `${titleLine}\n${subtitle}` : titleLine;

  return boxen(content, {
    borderStyle: "round",
    borderColor: "cyan",
    padding: 1,
  });
}

/**
 * Creates a formatted table for accounts display
 *
 * @param accounts - Array of account data
 * @returns Formatted table string
 */
export function accountTable(accounts: AccountData[]): string {
  const table = new Table({
    head: ["Email", "Status", "Last Used"],
    style: {
      head: [],
      border: [],
    },
  });

  for (const account of accounts) {
    const statusDisplay = formatStatus(account.status);
    const lastUsedDisplay = account.lastUsed ? formatDate(account.lastUsed) : pc.dim("-");

    table.push([account.email, statusDisplay, lastUsedDisplay]);
  }

  return table.toString();
}

/**
 * Formats account status with color and symbol
 */
function formatStatus(status: AccountStatus): string {
  switch (status) {
    case "valid":
      return `${symbols.success} ${pc.green("valid")}`;
    case "rate-limited":
      return `${symbols.warning} ${pc.yellow("rate-limited")}`;
    case "expired":
      return `${symbols.error} ${pc.red("expired")}`;
    case "unknown":
      return `${symbols.error} ${pc.red("unknown")}`;
  }
}

/**
 * Formats a date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleString();
}

/**
 * Creates a section header with bold cyan title and dim underline
 *
 * @param title - The section title
 * @returns Formatted section header string
 */
export function sectionHeader(title: string): string {
  const styledTitle = pc.bold(pc.cyan(title));
  const underline = pc.dim("─".repeat(title.length));
  return `${styledTitle}\n${underline}`;
}

/**
 * Creates a formatted key-value display
 *
 * @param pairs - Object with key-value pairs to display
 * @returns Formatted key-value string
 */
export function keyValue(pairs: Record<string, string>): string {
  const entries = Object.entries(pairs);
  if (entries.length === 0) {
    return "";
  }

  // Find the longest key for alignment
  const maxKeyLength = Math.max(...entries.map(([key]) => key.length));

  const lines = entries.map(([key, value]) => {
    const paddedKey = key.padEnd(maxKeyLength);
    return `${pc.bold(paddedKey)}  ${value}`;
  });

  return lines.join("\n");
}
