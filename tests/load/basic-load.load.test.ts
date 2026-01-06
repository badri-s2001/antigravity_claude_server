/**
 * Load Tests: Basic Performance
 *
 * Tests performance under sustained load.
 * Requires server to be running: npm start
 *
 * Run with: RUN_LOAD_TESTS=true npm run test:load
 */

import { describe, it, expect } from "vitest";
import autocannon from "autocannon";

const SERVER_URL = process.env.PROXY_URL ?? "http://localhost:8080";

// Skip if not running with load test flag
const shouldRunLoadTests = process.env.RUN_LOAD_TESTS === "true";

describe.skipIf(!shouldRunLoadTests)("Load Tests", () => {
  describe("Health Endpoint", () => {
    it("handles 100 req/s for 10 seconds", async () => {
      const result = await autocannon({
        url: `${SERVER_URL}/health`,
        connections: 10,
        duration: 10,
        pipelining: 1,
      });

      // Expectations
      expect(result.errors).toBe(0);
      expect(result.timeouts).toBe(0);
      expect(result.non2xx).toBe(0);
      expect(result.latency.p99).toBeLessThan(100); // < 100ms P99
    });
  });

  describe("Models Endpoint", () => {
    it("handles 50 req/s for 10 seconds", async () => {
      const result = await autocannon({
        url: `${SERVER_URL}/v1/models`,
        connections: 5,
        duration: 10,
        pipelining: 1,
      });

      expect(result.errors).toBe(0);
      expect(result.timeouts).toBe(0);
      expect(result.latency.p99).toBeLessThan(200);
    });
  });

  describe("Account Limits Endpoint", () => {
    it("handles burst of 100 requests", async () => {
      const result = await autocannon({
        url: `${SERVER_URL}/account-limits`,
        connections: 10,
        amount: 100,
        pipelining: 1,
      });

      expect(result.errors).toBe(0);
      expect(result.timeouts).toBe(0);
    });
  });
});
