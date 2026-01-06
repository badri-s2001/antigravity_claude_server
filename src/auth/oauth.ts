/**
 * Google OAuth with PKCE for Antigravity
 *
 * Implements the same OAuth flow as opencode-antigravity-auth
 * to obtain refresh tokens for multiple Google accounts.
 * Uses a local callback server to automatically capture the auth code.
 */

import crypto from "crypto";
import http from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { ANTIGRAVITY_ENDPOINT_FALLBACKS, ANTIGRAVITY_HEADERS, OAUTH_CONFIG, OAUTH_REDIRECT_URI } from "../constants.js";
import { getLogger } from "../utils/logger-new.js";

/**
 * PKCE code verifier and challenge
 */
interface PKCEData {
  verifier: string;
  challenge: string;
}

/**
 * Authorization URL data
 */
export interface AuthorizationUrlData {
  url: string;
  verifier: string;
  state: string;
}

/**
 * Extracted code from user input
 */
export interface ExtractedCode {
  code: string;
  state: string | null;
}

/**
 * OAuth tokens from token exchange
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Refreshed access token
 */
export interface RefreshedToken {
  accessToken: string;
  expiresIn: number;
}

/**
 * Complete account info from OAuth flow
 */
export interface AccountInfo {
  email: string;
  refreshToken: string;
  accessToken: string;
  projectId: string | null;
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): PKCEData {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * Generate authorization URL for Google OAuth
 * Returns the URL and the PKCE verifier (needed for token exchange)
 *
 * @returns Auth URL and PKCE data
 */
export function getAuthorizationUrl(): AuthorizationUrlData {
  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.clientId,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: OAUTH_CONFIG.scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: state,
  });

  return {
    url: `${OAUTH_CONFIG.authUrl}?${params.toString()}`,
    verifier,
    state,
  };
}

/**
 * Extract authorization code and state from user input.
 * User can paste either:
 * - Full callback URL: http://localhost:51121/oauth-callback?code=xxx&state=xxx
 * - Just the code parameter: 4/0xxx...
 *
 * @param input - User input (URL or code)
 * @returns Extracted code and optional state
 */
export function extractCodeFromInput(input: string): ExtractedCode {
  if (!input || typeof input !== "string") {
    throw new Error("No input provided");
  }

  const trimmed = input.trim();

  // Check if it looks like a URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (!code) {
        throw new Error("No authorization code found in URL");
      }

      return { code, state };
    } catch (e) {
      const err = e as Error;
      if (err.message.includes("OAuth error") || err.message.includes("No authorization code")) {
        throw e;
      }
      throw new Error("Invalid URL format");
    }
  }

  // Assume it's a raw code
  // Google auth codes typically start with "4/" and are long
  if (trimmed.length < 10) {
    throw new Error("Input is too short to be a valid authorization code");
  }

  return { code: trimmed, state: null };
}

/**
 * Start a local server to receive the OAuth callback
 * Returns a promise that resolves with the authorization code
 *
 * @param expectedState - Expected state parameter for CSRF protection
 * @param timeoutMs - Timeout in milliseconds (default 120000)
 * @returns Authorization code from OAuth callback
 */
export function startCallbackServer(expectedState: string, timeoutMs = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "", `http://localhost:${OAUTH_CONFIG.callbackPort}`);

      if (url.pathname !== "/oauth-callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`
                    <html>
                    <head><title>Authentication Failed</title></head>
                    <body style="font-family: system-ui; padding: 40px; text-align: center;">
                        <h1 style="color: #dc3545;">Authentication Failed</h1>
                        <p>Error: ${error}</p>
                        <p>You can close this window.</p>
                    </body>
                    </html>
                `);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`
                    <html>
                    <head><title>Authentication Failed</title></head>
                    <body style="font-family: system-ui; padding: 40px; text-align: center;">
                        <h1 style="color: #dc3545;">Authentication Failed</h1>
                        <p>State mismatch - possible CSRF attack.</p>
                        <p>You can close this window.</p>
                    </body>
                    </html>
                `);
        server.close();
        reject(new Error("State mismatch"));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`
                    <html>
                    <head><title>Authentication Failed</title></head>
                    <body style="font-family: system-ui; padding: 40px; text-align: center;">
                        <h1 style="color: #dc3545;">Authentication Failed</h1>
                        <p>No authorization code received.</p>
                        <p>You can close this window.</p>
                    </body>
                    </html>
                `);
        server.close();
        reject(new Error("No authorization code"));
        return;
      }

      // Success!
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
                <html>
                <head><title>Authentication Successful</title></head>
                <body style="font-family: system-ui; padding: 40px; text-align: center;">
                    <h1 style="color: #28a745;">Authentication Successful!</h1>
                    <p>You can close this window and return to the terminal.</p>
                    <script>setTimeout(() => window.close(), 2000);</script>
                </body>
                </html>
            `);

      server.close();
      resolve(code);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${OAUTH_CONFIG.callbackPort} is already in use. Close any other OAuth flows and try again.`));
      } else {
        reject(err);
      }
    });

    server.listen(OAUTH_CONFIG.callbackPort, () => {
      getLogger().info(`[OAuth] Callback server listening on port ${OAUTH_CONFIG.callbackPort}`);
    });

    // Timeout after specified duration
    setTimeout(() => {
      server.close();
      reject(new Error("OAuth callback timeout - no response received"));
    }, timeoutMs);
  });
}

/**
 * Token response from Google OAuth
 */
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/**
 * Exchange authorization code for tokens
 *
 * @param code - Authorization code from OAuth callback
 * @param verifier - PKCE code verifier
 * @returns OAuth tokens
 */
export async function exchangeCode(code: string, verifier: string): Promise<OAuthTokens> {
  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: OAUTH_CONFIG.clientId,
      client_secret: OAUTH_CONFIG.clientSecret,
      code: code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: OAUTH_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    getLogger().error(`[OAuth] Token exchange failed: ${response.status} ${error}`);
    throw new Error(`Token exchange failed: ${error}`);
  }

  const tokens = (await response.json()) as TokenResponse;

  if (!tokens.access_token) {
    getLogger().error({ tokens }, "[OAuth] No access token in response");
    throw new Error("No access token received");
  }

  getLogger().info(`[OAuth] Token exchange successful, access_token length: ${tokens.access_token.length}`);

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? "",
    expiresIn: tokens.expires_in,
  };
}

/**
 * Refresh access token using refresh token
 *
 * @param refreshToken - OAuth refresh token
 * @returns New access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<RefreshedToken> {
  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: OAUTH_CONFIG.clientId,
      client_secret: OAUTH_CONFIG.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const tokens = (await response.json()) as TokenResponse;
  return {
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in,
  };
}

/**
 * User info response from Google
 */
interface UserInfoResponse {
  email: string;
  [key: string]: unknown;
}

/**
 * Get user email from access token
 *
 * @param accessToken - OAuth access token
 * @returns User's email address
 */
export async function getUserEmail(accessToken: string): Promise<string> {
  const response = await fetch(OAUTH_CONFIG.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    getLogger().error(`[OAuth] getUserEmail failed: ${response.status} ${errorText}`);
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  const userInfo = (await response.json()) as UserInfoResponse;
  return userInfo.email;
}

/**
 * Load code assist response from Antigravity API
 */
interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string | { id: string };
}

/**
 * Discover project ID for the authenticated user
 *
 * @param accessToken - OAuth access token
 * @returns Project ID or null if not found
 */
export async function discoverProjectId(accessToken: string): Promise<string | null> {
  for (const endpoint of ANTIGRAVITY_ENDPOINT_FALLBACKS) {
    try {
      const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...ANTIGRAVITY_HEADERS,
        },
        body: JSON.stringify({
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
      });

      if (!response.ok) continue;

      const data = (await response.json()) as LoadCodeAssistResponse;

      if (typeof data.cloudaicompanionProject === "string") {
        return data.cloudaicompanionProject;
      }
      if (data.cloudaicompanionProject?.id) {
        return data.cloudaicompanionProject.id;
      }
    } catch (error) {
      const err = error as Error;
      getLogger().warn({ endpoint, error: err.message }, "[OAuth] Project discovery failed");
    }
  }

  return null;
}

/**
 * Complete OAuth flow: exchange code and get all account info
 *
 * @param code - Authorization code from OAuth callback
 * @param verifier - PKCE code verifier
 * @returns Complete account info
 */
export async function completeOAuthFlow(code: string, verifier: string): Promise<AccountInfo> {
  // Exchange code for tokens
  const tokens = await exchangeCode(code, verifier);

  // Get user email
  const email = await getUserEmail(tokens.accessToken);

  // Discover project ID
  const projectId = await discoverProjectId(tokens.accessToken);

  return {
    email,
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    projectId,
  };
}

/**
 * Validate a refresh token and get account info
 *
 * This allows adding accounts using only a refresh token, without going
 * through the full OAuth authorization flow. Useful for:
 * - Importing tokens from other tools (e.g., Gemini CLI, opencode-antigravity-auth)
 * - Adding accounts on headless servers where OAuth callback is difficult
 * - Sharing account access within teams
 *
 * @param refreshToken - Google OAuth refresh token
 * @returns Complete account info
 * @throws If the refresh token is invalid or expired
 */
export async function validateRefreshToken(refreshToken: string): Promise<AccountInfo> {
  if (!refreshToken || typeof refreshToken !== "string") {
    throw new Error("Refresh token is required");
  }

  const trimmed = refreshToken.trim();
  if (trimmed.length < 20) {
    throw new Error("Invalid refresh token format - token is too short");
  }

  getLogger().info("[OAuth] Validating refresh token...");

  // Get access token using the refresh token
  const { accessToken } = await refreshAccessToken(trimmed);

  // Get user email
  const email = await getUserEmail(accessToken);
  getLogger().info(`[OAuth] Token validated for: ${email}`);

  // Discover project ID
  const projectId = await discoverProjectId(accessToken);
  if (projectId) {
    getLogger().info(`[OAuth] Discovered project ID: ${projectId}`);
  }

  return {
    email,
    refreshToken: trimmed,
    accessToken,
    projectId,
  };
}
