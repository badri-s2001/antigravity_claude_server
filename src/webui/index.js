/**
 * WebUI Module - Optional web interface for account management
 *
 * This module provides a web-based UI for:
 * - Dashboard with real-time model quota visualization
 * - Account management (add via OAuth, enable/disable, refresh, remove)
 * - Live server log streaming with filtering
 * - Claude CLI configuration editor
 *
 * Usage in server.js:
 *   import { mountWebUI } from './webui/index.js';
 *   mountWebUI(app, __dirname, accountManager);
 */

import path from 'path';
import express from 'express';
import { getPublicConfig, saveConfig, config } from '../config.js';
import { DEFAULT_PORT } from '../constants.js';
import { readClaudeConfig, updateClaudeConfig, getClaudeConfigPath } from '../utils/claude-config.js';
import { logger } from '../utils/logger.js';
import { getAuthorizationUrl, completeOAuthFlow } from '../auth/oauth.js';

// OAuth state storage (state -> { verifier, timestamp })
const pendingOAuthStates = new Map();

/**
 * Auth Middleware - Optional password protection for WebUI
 * Password can be set via WEBUI_PASSWORD env var or config.json
 */
function createAuthMiddleware() {
    return (req, res, next) => {
        const password = config.webuiPassword;
        if (!password) return next();

        // Determine if this path should be protected
        const isApiRoute = req.path.startsWith('/api/');
        const isException = req.path === '/api/auth/url' || req.path === '/api/config';
        const isProtected = (isApiRoute && !isException) || req.path === '/account-limits' || req.path === '/health';

        if (isProtected) {
            const providedPassword = req.headers['x-webui-password'] || req.query.password;
            if (providedPassword !== password) {
                return res.status(401).json({ status: 'error', error: 'Unauthorized: Password required' });
            }
        }
        next();
    };
}

/**
 * Mount WebUI routes and middleware on Express app
 * @param {Express} app - Express application instance
 * @param {string} dirname - __dirname of the calling module (for static file path)
 * @param {AccountManager} accountManager - Account manager instance
 */
export function mountWebUI(app, dirname, accountManager) {
    // Apply auth middleware
    app.use(createAuthMiddleware());

    // Serve static files from public directory
    app.use(express.static(path.join(dirname, '../public')));

    // ==========================================
    // Account Management API
    // ==========================================

    /**
     * GET /api/accounts - List all accounts with status
     */
    app.get('/api/accounts', async (req, res) => {
        try {
            const status = accountManager.getStatus();
            res.json({
                status: 'ok',
                accounts: status.accounts,
                summary: {
                    total: status.total,
                    available: status.available,
                    rateLimited: status.rateLimited,
                    invalid: status.invalid
                }
            });
        } catch (error) {
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    /**
     * POST /api/accounts/:email/refresh - Refresh specific account token
     */
    app.post('/api/accounts/:email/refresh', async (req, res) => {
        try {
            const { email } = req.params;
            accountManager.clearTokenCache(email);
            accountManager.clearProjectCache(email);
            res.json({
                status: 'ok',
                message: `Token cache cleared for ${email}`
            });
        } catch (error) {
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    /**
     * POST /api/accounts/:email/toggle - Enable/disable account
     */
    app.post('/api/accounts/:email/toggle', async (req, res) => {
        try {
            const { email } = req.params;
            const { enabled } = req.body;

            if (typeof enabled !== 'boolean') {
                return res.status(400).json({ status: 'error', error: 'enabled must be a boolean' });
            }

            accountManager.setAccountEnabled(email, enabled);
            res.json({
                status: 'ok',
                message: `Account ${email} ${enabled ? 'enabled' : 'disabled'}`
            });
        } catch (error) {
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    /**
     * DELETE /api/accounts/:email - Remove account
     */
    app.delete('/api/accounts/:email', async (req, res) => {
        try {
            const { email } = req.params;
            accountManager.removeAccount(email);
            res.json({
                status: 'ok',
                message: `Account ${email} removed`
            });
        } catch (error) {
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    /**
     * POST /api/accounts/reload - Reload accounts from disk
     */
    app.post('/api/accounts/reload', async (req, res) => {
        try {
            await accountManager.reloadAccounts();
            const status = accountManager.getStatus();
            res.json({
                status: 'ok',
                message: 'Accounts reloaded from disk',
                summary: status.summary
            });
        } catch (error) {
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    // ==========================================
    // Configuration API
    // ==========================================

    /**
     * GET /api/config - Get server configuration
     */
    app.get('/api/config', (req, res) => {
        try {
            const publicConfig = getPublicConfig();
            res.json({
                status: 'ok',
                config: publicConfig,
                note: 'Edit ~/.config/antigravity-proxy/config.json or use env vars to change these values'
            });
        } catch (error) {
            logger.error('[WebUI] Error getting config:', error);
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    /**
     * POST /api/config - Update server configuration
     */
    app.post('/api/config', (req, res) => {
        try {
            const { debug, logLevel, maxRetries, retryBaseMs, retryMaxMs, persistTokenCache } = req.body;

            // Only allow updating specific fields (security)
            const updates = {};
            if (typeof debug === 'boolean') updates.debug = debug;
            if (logLevel && ['info', 'warn', 'error', 'debug'].includes(logLevel)) {
                updates.logLevel = logLevel;
            }
            if (typeof maxRetries === 'number' && maxRetries >= 1 && maxRetries <= 20) {
                updates.maxRetries = maxRetries;
            }
            if (typeof retryBaseMs === 'number' && retryBaseMs >= 100 && retryBaseMs <= 10000) {
                updates.retryBaseMs = retryBaseMs;
            }
            if (typeof retryMaxMs === 'number' && retryMaxMs >= 1000 && retryMaxMs <= 120000) {
                updates.retryMaxMs = retryMaxMs;
            }
            if (typeof persistTokenCache === 'boolean') {
                updates.persistTokenCache = persistTokenCache;
            }

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({
                    status: 'error',
                    error: 'No valid configuration updates provided'
                });
            }

            const success = saveConfig(updates);

            if (success) {
                res.json({
                    status: 'ok',
                    message: 'Configuration saved. Restart server to apply some changes.',
                    updates: updates,
                    config: getPublicConfig()
                });
            } else {
                res.status(500).json({
                    status: 'error',
                    error: 'Failed to save configuration file'
                });
            }
        } catch (error) {
            logger.error('[WebUI] Error updating config:', error);
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    /**
     * GET /api/settings - Get runtime settings
     */
    app.get('/api/settings', async (req, res) => {
        try {
            const settings = accountManager.getSettings ? accountManager.getSettings() : {};
            res.json({
                status: 'ok',
                settings: {
                    ...settings,
                    port: process.env.PORT || DEFAULT_PORT
                }
            });
        } catch (error) {
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    // ==========================================
    // Claude CLI Configuration API
    // ==========================================

    /**
     * GET /api/claude/config - Get Claude CLI configuration
     */
    app.get('/api/claude/config', async (req, res) => {
        try {
            const claudeConfig = await readClaudeConfig();
            res.json({
                status: 'ok',
                config: claudeConfig,
                path: getClaudeConfigPath()
            });
        } catch (error) {
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    /**
     * POST /api/claude/config - Update Claude CLI configuration
     */
    app.post('/api/claude/config', async (req, res) => {
        try {
            const updates = req.body;
            if (!updates || typeof updates !== 'object') {
                return res.status(400).json({ status: 'error', error: 'Invalid config updates' });
            }

            const newConfig = await updateClaudeConfig(updates);
            res.json({
                status: 'ok',
                config: newConfig,
                message: 'Claude configuration updated'
            });
        } catch (error) {
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    /**
     * POST /api/models/config - Update model configuration (hidden/pinned/alias)
     */
    app.post('/api/models/config', (req, res) => {
        try {
            const { modelId, config: newModelConfig } = req.body;

            if (!modelId || typeof newModelConfig !== 'object') {
                return res.status(400).json({ status: 'error', error: 'Invalid parameters' });
            }

            // Load current config
            const currentMapping = config.modelMapping || {};

            // Update specific model config
            currentMapping[modelId] = {
                ...currentMapping[modelId],
                ...newModelConfig
            };

            // Save back to main config
            const success = saveConfig({ modelMapping: currentMapping });

            if (success) {
                // Update in-memory config reference
                config.modelMapping = currentMapping;
                res.json({ status: 'ok', modelConfig: currentMapping[modelId] });
            } else {
                throw new Error('Failed to save configuration');
            }
        } catch (error) {
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    // ==========================================
    // Logs API
    // ==========================================

    /**
     * GET /api/logs - Get log history
     */
    app.get('/api/logs', (req, res) => {
        res.json({
            status: 'ok',
            logs: logger.getHistory ? logger.getHistory() : []
        });
    });

    /**
     * GET /api/logs/stream - Stream logs via SSE
     */
    app.get('/api/logs/stream', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendLog = (log) => {
            res.write(`data: ${JSON.stringify(log)}\n\n`);
        };

        // Send recent history if requested
        if (req.query.history === 'true' && logger.getHistory) {
            const history = logger.getHistory();
            history.forEach(log => sendLog(log));
        }

        // Subscribe to new logs
        if (logger.on) {
            logger.on('log', sendLog);
        }

        // Cleanup on disconnect
        req.on('close', () => {
            if (logger.off) {
                logger.off('log', sendLog);
            }
        });
    });

    // ==========================================
    // OAuth API
    // ==========================================

    /**
     * GET /api/auth/url - Get OAuth URL to start the flow
     */
    app.get('/api/auth/url', (req, res) => {
        try {
            const { email } = req.query;
            const { url, verifier, state } = getAuthorizationUrl(email);

            // Store the verifier temporarily
            pendingOAuthStates.set(state, { verifier, timestamp: Date.now() });

            // Clean up old states (> 10 mins)
            const now = Date.now();
            for (const [key, val] of pendingOAuthStates.entries()) {
                if (now - val.timestamp > 10 * 60 * 1000) {
                    pendingOAuthStates.delete(key);
                }
            }

            res.json({ status: 'ok', url });
        } catch (error) {
            logger.error('[WebUI] Error generating auth URL:', error);
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    /**
     * GET /oauth/callback - OAuth callback handler
     */
    app.get('/oauth/callback', async (req, res) => {
        const { code, state, error } = req.query;

        if (error) {
            return res.status(400).send(`Authentication failed: ${error}`);
        }

        if (!code || !state) {
            return res.status(400).send('Missing code or state parameter');
        }

        const storedState = pendingOAuthStates.get(state);
        if (!storedState) {
            return res.status(400).send('Invalid or expired state parameter. Please try again.');
        }

        // Remove used state
        pendingOAuthStates.delete(state);

        try {
            const accountData = await completeOAuthFlow(code, storedState.verifier);

            // Add or update the account
            accountManager.addAccount({
                email: accountData.email,
                refreshToken: accountData.refreshToken,
                projectId: accountData.projectId,
                source: 'oauth'
            });

            // Return a simple HTML page that closes itself or redirects
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Authentication Successful</title>
                    <style>
                        body {
                            font-family: system-ui, -apple-system, sans-serif;
                            background: #09090b;
                            color: #e4e4e7;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            flex-direction: column;
                        }
                        h1 { color: #22c55e; }
                    </style>
                </head>
                <body>
                    <h1>Authentication Successful</h1>
                    <p>Account ${accountData.email} has been added.</p>
                    <p>You can close this window now.</p>
                    <script>
                        // Notify opener if opened via window.open
                        if (window.opener) {
                            window.opener.postMessage({ type: 'oauth-success', email: '${accountData.email}' }, '*');
                            setTimeout(() => window.close(), 2000);
                        } else {
                            // If redirected in same tab, redirect back to home after delay
                            setTimeout(() => window.location.href = '/', 3000);
                        }
                    </script>
                </body>
                </html>
            `);
        } catch (err) {
            logger.error('[WebUI] OAuth callback error:', err);
            res.status(500).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Authentication Failed</title>
                    <style>
                        body {
                            font-family: system-ui, -apple-system, sans-serif;
                            background: #09090b;
                            color: #ef4444;
                            text-align: center;
                            padding: 50px;
                        }
                    </style>
                </head>
                <body>
                    <h1>Authentication Failed</h1>
                    <p>${err.message}</p>
                </body>
                </html>
            `);
        }
    });

    logger.info('[WebUI] Mounted at /');
}
