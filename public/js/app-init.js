/**
 * App Initialization (Non-module version)
 * This must load BEFORE Alpine initializes
 */

document.addEventListener('alpine:init', () => {
    console.log('Registering app component...');

    // Main App Controller
    Alpine.data('app', () => ({
        // Re-expose store properties for easier access in navbar
        get connectionStatus() {
            return Alpine.store('data').connectionStatus;
        },
        get loading() {
            return Alpine.store('data').loading;
        },

        init() {
            console.log('App component initializing...');

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
            const interval = parseInt(Alpine.store('settings').refreshInterval);
            if (interval > 0) {
                this.refreshTimer = setInterval(() => Alpine.store('data').fetchData(), interval * 1000);
            }
        },

        // Translation helper for modal (not in a component scope)
        t(key) {
            return Alpine.store('global').t(key);
        },

        // Add account handler for modal
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
                    const width = 600;
                    const height = 700;
                    const left = (screen.width - width) / 2;
                    const top = (screen.height - height) / 2;

                    window.open(
                        data.url,
                        'google_oauth',
                        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
                    );

                    const messageHandler = (event) => {
                        if (event.data?.type === 'oauth-success') {
                            const action = reAuthEmail ? 're-authenticated' : 'added';
                            Alpine.store('global').showToast(`Account ${event.data.email} ${action} successfully`, 'success');
                            Alpine.store('data').fetchData();

                            const modal = document.getElementById('add_account_modal');
                            if (modal) modal.close();
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
