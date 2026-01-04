/**
 * Logs Viewer Component
 * Registers itself to window.Components for Alpine.js to consume
 */
window.Components = window.Components || {};

window.Components.logsViewer = () => ({
    logs: [],
    isAutoScroll: true,
    eventSource: null,
    searchQuery: '',
    filters: {
        INFO: true,
        WARN: true,
        ERROR: true,
        SUCCESS: true,
        DEBUG: false
    },

    get filteredLogs() {
        const query = this.searchQuery.toLowerCase();
        return this.logs.filter(log => {
            // Level Filter
            if (!this.filters[log.level]) return false;

            // Search Filter
            if (query && !log.message.toLowerCase().includes(query)) return false;

            return true;
        });
    },

    init() {
        this.startLogStream();

        this.$watch('isAutoScroll', (val) => {
            if (val) this.scrollToBottom();
        });

        // Watch filters to maintain auto-scroll if enabled
        this.$watch('searchQuery', () => { if(this.isAutoScroll) this.$nextTick(() => this.scrollToBottom()) });
        this.$watch('filters', () => { if(this.isAutoScroll) this.$nextTick(() => this.scrollToBottom()) });
    },

    startLogStream() {
        if (this.eventSource) this.eventSource.close();

        const password = Alpine.store('global').webuiPassword;
        const url = password
            ? `/api/logs/stream?history=true&password=${encodeURIComponent(password)}`
            : '/api/logs/stream?history=true';

        this.eventSource = new EventSource(url);
        this.eventSource.onmessage = (event) => {
            try {
                const log = JSON.parse(event.data);
                this.logs.push(log);

                // Limit log buffer
                const limit = Alpine.store('settings')?.logLimit || 2000;
                if (this.logs.length > limit) {
                    this.logs = this.logs.slice(-limit);
                }

                if (this.isAutoScroll) {
                    this.$nextTick(() => this.scrollToBottom());
                }
            } catch (e) {
                console.error('Log parse error:', e);
            }
        };

        this.eventSource.onerror = () => {
            console.warn('Log stream disconnected, reconnecting...');
            setTimeout(() => this.startLogStream(), 3000);
        };
    },

    scrollToBottom() {
        const container = document.getElementById('logs-container');
        if (container) container.scrollTop = container.scrollHeight;
    },

    clearLogs() {
        this.logs = [];
    }
});
