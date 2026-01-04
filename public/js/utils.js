/**
 * Utility functions for Antigravity Console
 */

window.utils = {
    // Shared Request Wrapper
    async request(url, options = {}, webuiPassword = '') {
        options.headers = options.headers || {};
        if (webuiPassword) {
            options.headers['x-webui-password'] = webuiPassword;
        }

        let response = await fetch(url, options);

        if (response.status === 401) {
            const password = prompt('Enter Web UI Password:');
            if (password) {
                // Return new password so caller can update state
                // This implies we need a way to propagate the new password back
                // For simplicity in this functional utility, we might need a callback or state access
                // But generally utils shouldn't probably depend on global state directly if possible
                // let's stick to the current logic but wrapped
                localStorage.setItem('antigravity_webui_password', password);
                options.headers['x-webui-password'] = password;
                response = await fetch(url, options);
                return { response, newPassword: password };
            }
        }

        return { response, newPassword: null };
    },

    formatTimeUntil(isoTime) {
        const diff = new Date(isoTime) - new Date();
        if (diff <= 0) return 'READY';
        const mins = Math.floor(diff / 60000);
        const hrs = Math.floor(mins / 60);
        if (hrs > 0) return `${hrs}H ${mins % 60}M`;
        return `${mins}M`;
    }
};
