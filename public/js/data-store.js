/**
 * Data Store
 * Holds Accounts, Models, and Computed Quota Rows
 * Shared between Dashboard and AccountManager
 */

// utils is loaded globally as window.utils in utils.js

document.addEventListener('alpine:init', () => {
    Alpine.store('data', {
        accounts: [],
        models: [], // Source of truth
        modelConfig: {}, // Model metadata (hidden, pinned, alias)
        quotaRows: [], // Filtered view
        loading: false,
        connectionStatus: 'connecting',
        lastUpdated: '-',

        // Filters state
        filters: {
            account: 'all',
            family: 'all',
            search: ''
        },

        // Settings for calculation
        // We need to access global settings? Or duplicate?
        // Let's assume settings are passed or in another store.
        // For simplicity, let's keep relevant filters here.

        init() {
            // Watch filters to recompute
            // Alpine stores don't have $watch automatically unless inside a component?
            // We can manually call compute when filters change.
        },

        async fetchData() {
            this.loading = true;
            try {
                // Get password from global store
                const password = Alpine.store('global').webuiPassword;
                const { response, newPassword } = await window.utils.request('/account-limits', {}, password);

                if (newPassword) Alpine.store('global').webuiPassword = newPassword;

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                this.accounts = data.accounts || [];
                if (data.models && data.models.length > 0) {
                    this.models = data.models;
                }
                this.modelConfig = data.modelConfig || {};

                this.computeQuotaRows();

                this.connectionStatus = 'connected';
                this.lastUpdated = new Date().toLocaleTimeString();
            } catch (error) {
                console.error('Fetch error:', error);
                this.connectionStatus = 'disconnected';
                Alpine.store('global').showToast('Connection Lost', 'error');
            } finally {
                this.loading = false;
            }
        },

        computeQuotaRows() {
            const models = this.models || [];
            const rows = [];
            const showExhausted = Alpine.store('settings')?.showExhausted ?? true; // Need settings store
            // Temporary debug flag or settings flag to show hidden models
            const showHidden = Alpine.store('settings')?.showHiddenModels ?? false;

            models.forEach(modelId => {
                // Config
                const config = this.modelConfig[modelId] || {};
                const family = this.getModelFamily(modelId);

                // Smart Visibility Logic:
                // 1. If explicit config exists, use it.
                // 2. If no config, default 'unknown' families to HIDDEN to prevent clutter.
                // 3. Known families (Claude/Gemini) default to VISIBLE.
                let isHidden = config.hidden;
                if (isHidden === undefined) {
                    isHidden = (family === 'other' || family === 'unknown');
                }

                // Skip hidden models unless "Show Hidden" is enabled
                if (isHidden && !showHidden) return;

                // Filters
                if (this.filters.family !== 'all' && this.filters.family !== family) return;
                if (this.filters.search) {
                    const searchLower = this.filters.search.toLowerCase();
                    const aliasMatch = config.alias && config.alias.toLowerCase().includes(searchLower);
                    const idMatch = modelId.toLowerCase().includes(searchLower);
                    if (!aliasMatch && !idMatch) return;
                }

                // Data Collection
                const quotaInfo = [];
                let minQuota = 100;
                let totalQuotaSum = 0;
                let validAccountCount = 0;
                let minResetTime = null;

                this.accounts.forEach(acc => {
                    if (this.filters.account !== 'all' && acc.email !== this.filters.account) return;

                    const limit = acc.limits?.[modelId];
                    if (!limit) return;

                    const pct = limit.remainingFraction !== null ? Math.round(limit.remainingFraction * 100) : 0;
                    minQuota = Math.min(minQuota, pct);

                    // Accumulate for average
                    totalQuotaSum += pct;
                    validAccountCount++;

                    if (limit.resetTime && (!minResetTime || new Date(limit.resetTime) < new Date(minResetTime))) {
                        minResetTime = limit.resetTime;
                    }

                    quotaInfo.push({
                        email: acc.email.split('@')[0],
                        fullEmail: acc.email,
                        pct: pct,
                        resetTime: limit.resetTime
                    });
                });

                if (quotaInfo.length === 0) return;
                const avgQuota = validAccountCount > 0 ? Math.round(totalQuotaSum / validAccountCount) : 0;

                if (!showExhausted && minQuota === 0) return;

                rows.push({
                    modelId,
                    displayName: config.alias || modelId, // Use alias if available
                    family,
                    minQuota,
                    avgQuota, // Added Average Quota
                    minResetTime,
                    resetIn: minResetTime ? window.utils.formatTimeUntil(minResetTime) : '-',
                    quotaInfo,
                    pinned: !!config.pinned,
                    hidden: !!isHidden // Use computed visibility
                });
            });

            // Sort: Pinned first, then by avgQuota (descending)
            this.quotaRows = rows.sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                return b.avgQuota - a.avgQuota;
            });

            // Trigger Dashboard Update if active
            // Ideally dashboard watches this store.
        },

        getModelFamily(modelId) {
            const lower = modelId.toLowerCase();
            if (lower.includes('claude')) return 'claude';
            if (lower.includes('gemini')) return 'gemini';
            return 'other';
        }
    });
});
