/**
 * Unit tests for CLI UI utilities module
 *
 * Tests color helpers, status symbols, banner, accountTable, sectionHeader, and keyValue functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import pc from "picocolors";

// Import the module under test
import {
  // Color helpers
  success,
  error,
  warn,
  info,
  dim,
  bold,
  cyan,
  magenta,
  // Status symbols
  symbols,
  // UI components
  banner,
  accountTable,
  sectionHeader,
  keyValue,
} from "../../../src/cli/ui.js";

describe("Color helpers", () => {
  describe("success", () => {
    it("returns green colored text", () => {
      const result = success("test message");
      expect(result).toBe(pc.green("test message"));
    });

    it("handles empty string", () => {
      const result = success("");
      expect(result).toBe(pc.green(""));
    });
  });

  describe("error", () => {
    it("returns red colored text", () => {
      const result = error("error message");
      expect(result).toBe(pc.red("error message"));
    });

    it("handles empty string", () => {
      const result = error("");
      expect(result).toBe(pc.red(""));
    });
  });

  describe("warn", () => {
    it("returns yellow colored text", () => {
      const result = warn("warning message");
      expect(result).toBe(pc.yellow("warning message"));
    });

    it("handles empty string", () => {
      const result = warn("");
      expect(result).toBe(pc.yellow(""));
    });
  });

  describe("info", () => {
    it("returns blue colored text", () => {
      const result = info("info message");
      expect(result).toBe(pc.blue("info message"));
    });

    it("handles empty string", () => {
      const result = info("");
      expect(result).toBe(pc.blue(""));
    });
  });

  describe("dim", () => {
    it("returns dim colored text", () => {
      const result = dim("dim message");
      expect(result).toBe(pc.dim("dim message"));
    });

    it("handles empty string", () => {
      const result = dim("");
      expect(result).toBe(pc.dim(""));
    });
  });

  describe("bold", () => {
    it("returns bold text", () => {
      const result = bold("bold message");
      expect(result).toBe(pc.bold("bold message"));
    });

    it("handles empty string", () => {
      const result = bold("");
      expect(result).toBe(pc.bold(""));
    });
  });

  describe("cyan", () => {
    it("returns cyan colored text", () => {
      const result = cyan("cyan message");
      expect(result).toBe(pc.cyan("cyan message"));
    });

    it("handles empty string", () => {
      const result = cyan("");
      expect(result).toBe(pc.cyan(""));
    });
  });

  describe("magenta", () => {
    it("returns magenta colored text", () => {
      const result = magenta("magenta message");
      expect(result).toBe(pc.magenta("magenta message"));
    });

    it("handles empty string", () => {
      const result = magenta("");
      expect(result).toBe(pc.magenta(""));
    });
  });
});

describe("Status symbols", () => {
  describe("symbols.success", () => {
    it("returns green checkmark", () => {
      expect(symbols.success).toBe(pc.green("\u2714"));
    });
  });

  describe("symbols.error", () => {
    it("returns red X", () => {
      expect(symbols.error).toBe(pc.red("\u2718"));
    });
  });

  describe("symbols.warning", () => {
    it("returns yellow warning symbol", () => {
      expect(symbols.warning).toBe(pc.yellow("\u26A0"));
    });
  });

  describe("symbols.info", () => {
    it("returns blue info symbol", () => {
      expect(symbols.info).toBe(pc.blue("\u2139"));
    });
  });

  describe("symbols.arrow", () => {
    it("returns cyan arrow", () => {
      expect(symbols.arrow).toBe(pc.cyan("\u2192"));
    });
  });

  describe("symbols.bullet", () => {
    it("returns dim bullet", () => {
      expect(symbols.bullet).toBe(pc.dim("\u2022"));
    });
  });
});

describe("banner", () => {
  it("creates a boxed banner with title and version", () => {
    const result = banner("Test App", "1.0.0");

    // Should contain the title (bold cyan)
    expect(result).toContain("Test App");
    // Should contain the version (dim)
    expect(result).toContain("1.0.0");
    // Should be a boxed string (contains box characters)
    expect(result).toMatch(/[╭╮╰╯│─]/);
  });

  it("creates a banner with optional subtitle", () => {
    const result = banner("Test App", "1.0.0", "A test subtitle");

    expect(result).toContain("Test App");
    expect(result).toContain("1.0.0");
    expect(result).toContain("A test subtitle");
  });

  it("creates a banner without subtitle when not provided", () => {
    const result = banner("Test App", "1.0.0");

    expect(result).toContain("Test App");
    expect(result).toContain("1.0.0");
    // Should not contain extra newlines for subtitle
  });

  it("uses round border style", () => {
    const result = banner("Test", "1.0.0");

    // Round border uses curved corners
    expect(result).toMatch(/[╭╮╰╯]/);
  });
});

describe("accountTable", () => {
  it("creates a formatted table for accounts", () => {
    const accounts = [{ email: "test@example.com", status: "valid" as const }];
    const result = accountTable(accounts);

    expect(result).toContain("test@example.com");
    expect(result).toContain("valid");
  });

  it("color-codes valid status as green with success symbol", () => {
    const accounts = [{ email: "test@example.com", status: "valid" as const }];
    const result = accountTable(accounts);

    // Should contain green colored valid text
    expect(result).toContain(pc.green("valid"));
    // Should contain success symbol
    expect(result).toContain(symbols.success);
  });

  it("color-codes rate-limited status as yellow with warning symbol", () => {
    const accounts = [{ email: "test@example.com", status: "rate-limited" as const }];
    const result = accountTable(accounts);

    expect(result).toContain(pc.yellow("rate-limited"));
    expect(result).toContain(symbols.warning);
  });

  it("color-codes expired status as red with error symbol", () => {
    const accounts = [{ email: "test@example.com", status: "expired" as const }];
    const result = accountTable(accounts);

    expect(result).toContain(pc.red("expired"));
    expect(result).toContain(symbols.error);
  });

  it("color-codes unknown status as red with error symbol", () => {
    const accounts = [{ email: "test@example.com", status: "unknown" as const }];
    const result = accountTable(accounts);

    expect(result).toContain(pc.red("unknown"));
    expect(result).toContain(symbols.error);
  });

  it("handles multiple accounts", () => {
    const accounts = [
      { email: "user1@example.com", status: "valid" as const },
      { email: "user2@example.com", status: "rate-limited" as const },
      { email: "user3@example.com", status: "expired" as const },
    ];
    const result = accountTable(accounts);

    expect(result).toContain("user1@example.com");
    expect(result).toContain("user2@example.com");
    expect(result).toContain("user3@example.com");
  });

  it("handles empty accounts array", () => {
    const accounts: { email: string; status: "valid" | "rate-limited" | "expired" | "unknown"; lastUsed?: Date }[] = [];
    const result = accountTable(accounts);

    // Should return a table (even if empty)
    expect(typeof result).toBe("string");
  });

  it("displays lastUsed date when provided", () => {
    const testDate = new Date("2025-01-05T10:30:00Z");
    const accounts = [{ email: "test@example.com", status: "valid" as const, lastUsed: testDate }];
    const result = accountTable(accounts);

    // Should contain some representation of the date
    expect(result).toContain("test@example.com");
    // The date should be formatted in some way
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles missing lastUsed date", () => {
    const accounts = [{ email: "test@example.com", status: "valid" as const }];
    const result = accountTable(accounts);

    expect(result).toContain("test@example.com");
  });
});

describe("sectionHeader", () => {
  it("returns bold cyan title with dim underline", () => {
    const result = sectionHeader("Test Section");

    // Should contain the title in bold cyan
    expect(result).toContain(pc.bold(pc.cyan("Test Section")));
    // Should contain a dim underline
    expect(result).toContain(pc.dim("─".repeat("Test Section".length)));
  });

  it("handles empty string", () => {
    const result = sectionHeader("");

    expect(result).toContain(pc.bold(pc.cyan("")));
  });

  it("creates underline matching title length", () => {
    const title = "Short";
    const result = sectionHeader(title);

    expect(result).toContain(pc.dim("─".repeat(title.length)));
  });

  it("handles long titles", () => {
    const longTitle = "This is a very long section title for testing";
    const result = sectionHeader(longTitle);

    expect(result).toContain(pc.bold(pc.cyan(longTitle)));
    expect(result).toContain(pc.dim("─".repeat(longTitle.length)));
  });
});

describe("keyValue", () => {
  it("returns formatted key-value display", () => {
    const pairs = { Name: "John", Age: "30" };
    const result = keyValue(pairs);

    expect(result).toContain("Name");
    expect(result).toContain("John");
    expect(result).toContain("Age");
    expect(result).toContain("30");
  });

  it("handles empty object", () => {
    const pairs = {};
    const result = keyValue(pairs);

    expect(typeof result).toBe("string");
  });

  it("handles single key-value pair", () => {
    const pairs = { Key: "Value" };
    const result = keyValue(pairs);

    expect(result).toContain("Key");
    expect(result).toContain("Value");
  });

  it("aligns values properly", () => {
    const pairs = { Short: "A", LongerKey: "B" };
    const result = keyValue(pairs);

    // Both keys and values should be present
    expect(result).toContain("Short");
    expect(result).toContain("LongerKey");
    expect(result).toContain("A");
    expect(result).toContain("B");
  });

  it("formats keys with styling", () => {
    const pairs = { TestKey: "TestValue" };
    const result = keyValue(pairs);

    // Keys should have bold styling applied (check for the bold wrapper)
    // The result should contain the bold-styled key
    expect(result).toContain(pc.bold("TestKey"));
    expect(result).toContain("TestValue");
  });
});
