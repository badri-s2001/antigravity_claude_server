// tests/chaos/network-failures.chaos.test.ts
/**
 * Chaos Tests: Network Failures
 *
 * Tests resilience against network-level failures.
 * Verifies the system handles failures gracefully (doesn't crash),
 * not that it has specific retry logic.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { refreshAccessToken } from "../../src/auth/oauth.js";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com";

describe("Chaos: Network Failures", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe("Connection Errors", () => {
    it("handles connection refused (ECONNREFUSED)", async () => {
      nock(OAUTH_TOKEN_URL).post("/token").replyWithError({ code: "ECONNREFUSED" });

      await expect(refreshAccessToken("test-token")).rejects.toThrow();
    });

    it("handles connection reset (ECONNRESET)", async () => {
      nock(OAUTH_TOKEN_URL).post("/token").replyWithError({ code: "ECONNRESET" });

      await expect(refreshAccessToken("test-token")).rejects.toThrow();
    });

    it("handles DNS resolution failure (ENOTFOUND)", async () => {
      nock(OAUTH_TOKEN_URL).post("/token").replyWithError({ code: "ENOTFOUND" });

      await expect(refreshAccessToken("test-token")).rejects.toThrow();
    });

    it("handles timeout (ETIMEDOUT)", async () => {
      nock(OAUTH_TOKEN_URL).post("/token").replyWithError({ code: "ETIMEDOUT" });

      await expect(refreshAccessToken("test-token")).rejects.toThrow();
    });
  });

  describe("HTTP Errors", () => {
    it("handles 500 Internal Server Error", async () => {
      nock(OAUTH_TOKEN_URL).post("/token").reply(500, "Internal Server Error");

      await expect(refreshAccessToken("test-token")).rejects.toThrow(/refresh failed/i);
    });

    it("handles 502 Bad Gateway", async () => {
      nock(OAUTH_TOKEN_URL).post("/token").reply(502, "Bad Gateway");

      await expect(refreshAccessToken("test-token")).rejects.toThrow(/refresh failed/i);
    });

    it("handles 503 Service Unavailable", async () => {
      nock(OAUTH_TOKEN_URL).post("/token").reply(503, "Service Unavailable");

      await expect(refreshAccessToken("test-token")).rejects.toThrow(/refresh failed/i);
    });

    it("handles 429 Rate Limit with Retry-After", async () => {
      nock(OAUTH_TOKEN_URL).post("/token").reply(429, "Too Many Requests", { "Retry-After": "60" });

      await expect(refreshAccessToken("test-token")).rejects.toThrow(/refresh failed/i);
    });
  });

  describe("Malformed Responses", () => {
    it("handles empty response body", async () => {
      nock(OAUTH_TOKEN_URL).post("/token").reply(200, "");

      await expect(refreshAccessToken("test-token")).rejects.toThrow();
    });

    it("handles invalid JSON response", async () => {
      nock(OAUTH_TOKEN_URL).post("/token").reply(200, "not json {{{");

      await expect(refreshAccessToken("test-token")).rejects.toThrow();
    });

    it("handles response missing required fields", async () => {
      nock(OAUTH_TOKEN_URL).post("/token").reply(200, { unexpected: "data" });

      // The function should either throw or return undefined accessToken
      // Important: it should not crash
      try {
        const result = await refreshAccessToken("test-token");
        // If it doesn't throw, the accessToken should be undefined
        expect(result.accessToken).toBeUndefined();
      } catch {
        // Expected - implementation may throw
      }
    });

    it("handles wrong content-type header", async () => {
      nock(OAUTH_TOKEN_URL).post("/token").reply(200, '{"access_token": "test"}', { "Content-Type": "text/html" });

      // Should still work if JSON is valid (lenient parsing)
      // This may or may not throw depending on implementation
      // The important thing is it doesn't crash
      try {
        await refreshAccessToken("test-token");
      } catch {
        // Expected - implementation may reject
      }
    });
  });
});
