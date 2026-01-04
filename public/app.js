/**
 * Antigravity Console - Main Entry
 * 
 * This file orchestrates Alpine.js initialization.
 * Components are loaded via separate script files that register themselves
 * to window.Components before this script runs.
 */

document.addEventListener('alpine:init', () => {
    // Register Components (loaded from separate files via window.Components)
    Alpine.data('dashboard', window.Components.dashboard);
    Alpine.data('accountManager', window.Components.accountManager);
    Alpine.data('claudeConfig', window.Components.claudeConfig);
    Alpine.data('logsViewer', window.Components.logsViewer);

    // View Loader Directive
    Alpine.directive('load-view', (el, { expression }, { evaluate }) => {
        if (!window.viewCache) window.viewCache = new Map();

        // Evaluate the expression to get the actual view name (removes quotes)
        const viewName = evaluate(expression);

        if (window.viewCache.has(viewName)) {
            el.innerHTML = window.viewCache.get(viewName);
            Alpine.initTree(el);
            return;
        }

        fetch(`views/${viewName}.html`)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            })
            .then(html => {
                window.viewCache.set(viewName, html);
                el.innerHTML = html;
                Alpine.initTree(el);
            })
            .catch(err => {
                console.error('Failed to load view:', viewName, err);
                el.innerHTML = `<div class="p-4 border border-red-500/50 bg-red-500/10 rounded-lg text-red-400 font-mono text-sm">
                    Error loading view: ${viewName}<br>
                    <span class="text-xs opacity-75">${err.message}</span>
                </div>`;
            });
    });

    // Main App Controller
    Alpine.data('app', () => ({
        get connectionStatus() {
            return Alpine.store('data')?.connectionStatus || 'connecting';
        },
        get loading() {
            return Alpine.store('data')?.loading || false;
        },

        init() {
            console.log('App controller initialized');

            // Theme setup
            document.documentElement.setAttribute('data-theme', 'black');
            document.documentElement.classList.add('dark');

            // Chart Defaults
            if (typeof Chart !== 'undefined') {
                Chart.defaults.color = '#71717a';
                Chart.defaults.borderColor = '#27272a';
                Chart.defaults.font.family = '"JetBrains Mono", monospace';
            }

            // Start Data Polling
            this.startAutoRefresh();
            document.addEventListener('refresh-interval-changed', () => this.startAutoRefresh());

            // Initial Fetch
            Alpine.store('data').fetchData();
        },

        refreshTimer: null,

        fetchData() {
            Alpine.store('data').fetchData();
        },

        startAutoRefresh() {
            if (this.refreshTimer) clearInterval(this.refreshTimer);
            const interval = parseInt(Alpine.store('settings')?.refreshInterval || 60);
            if (interval > 0) {
                this.refreshTimer = setInterval(() => Alpine.store('data').fetchData(), interval * 1000);
            }
        },

        t(key) {
            return Alpine.store('global')?.t(key) || key;
        },

        async addAccountWeb(reAuthEmail = null) {
            const password = Alpine.store('global').webuiPassword;
            try {
                const urlPath = reAuthEmail
                    ? `/api/auth/url?email=${encodeURIComponent(reAuthEmail)}`
                    : '/api/auth/url';

                const { response, newPassword } = await window.utils.request(urlPath, {}, password);
                if (newPassword) Alpine.store('global').webuiPassword = newPassword;

                const data = await response.json();

                if (data.status === 'ok') {
                    window.open(data.url, 'google_oauth', 'width=600,height=700,scrollbars=yes');

                    const messageHandler = (event) => {
                        if (event.data?.type === 'oauth-success') {
                            const action = reAuthEmail ? 're-authenticated' : 'added';
                            Alpine.store('global').showToast(`Account ${event.data.email} ${action} successfully`, 'success');
                            Alpine.store('data').fetchData();
                            document.getElementById('add_account_modal')?.close();
                        }
                    };
                    window.addEventListener('message', messageHandler);
                    setTimeout(() => window.removeEventListener('message', messageHandler), 300000);
                } else {
                    Alpine.store('global').showToast(data.error || 'Failed to get auth URL', 'error');
                }
            } catch (e) {
                Alpine.store('global').showToast('Failed to start OAuth flow: ' + e.message, 'error');
            }
        }
    }));
});