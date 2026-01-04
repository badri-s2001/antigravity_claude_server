/**
 * Claude Config Component
 * Registers itself to window.Components for Alpine.js to consume
 */
window.Components = window.Components || {};

window.Components.claudeConfig = () => ({
    config: { env: {} },
    models: [],
    loading: false,

    init() {
        this.fetchConfig();
        this.$watch('$store.data.models', (val) => {
            this.models = val || [];
        });
        this.models = Alpine.store('data').models || [];
    },

    async fetchConfig() {
        const password = Alpine.store('global').webuiPassword;
        try {
            const { response, newPassword } = await window.utils.request('/api/claude/config', {}, password);
            if (newPassword) Alpine.store('global').webuiPassword = newPassword;

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this.config = data.config || {};
            if (!this.config.env) this.config.env = {};
        } catch (e) {
            console.error('Failed to fetch Claude config:', e);
        }
    },

    async saveClaudeConfig() {
        this.loading = true;
        const password = Alpine.store('global').webuiPassword;
        try {
            const { response, newPassword } = await window.utils.request('/api/claude/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.config)
            }, password);
            if (newPassword) Alpine.store('global').webuiPassword = newPassword;

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            Alpine.store('global').showToast('Claude config saved!', 'success');
        } catch (e) {
            Alpine.store('global').showToast('Failed to save config: ' + e.message, 'error');
        } finally {
            this.loading = false;
        }
    }
});
