/**
 * Account Manager Component
 * Registers itself to window.Components for Alpine.js to consume
 */
window.Components = window.Components || {};

window.Components.accountManager = () => ({
    async refreshAccount(email) {
        Alpine.store('global').showToast(`Refreshing ${email}...`, 'info');
        const password = Alpine.store('global').webuiPassword;
        try {
            const { response, newPassword } = await window.utils.request(`/api/accounts/${encodeURIComponent(email)}/refresh`, { method: 'POST' }, password);
            if (newPassword) Alpine.store('global').webuiPassword = newPassword;

            const data = await response.json();
            if (data.status === 'ok') {
                Alpine.store('global').showToast(`Refreshed ${email}`, 'success');
                Alpine.store('data').fetchData();
            } else {
                Alpine.store('global').showToast(data.error || 'Refresh failed', 'error');
            }
        } catch (e) {
            Alpine.store('global').showToast('Refresh failed: ' + e.message, 'error');
        }
    },

    async toggleAccount(email, enabled) {
        const password = Alpine.store('global').webuiPassword;
        try {
            const { response, newPassword } = await window.utils.request(`/api/accounts/${encodeURIComponent(email)}/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            }, password);
            if (newPassword) Alpine.store('global').webuiPassword = newPassword;

            const data = await response.json();
            if (data.status === 'ok') {
                Alpine.store('global').showToast(`Account ${email} ${enabled ? 'enabled' : 'disabled'}`, 'success');
                Alpine.store('data').fetchData();
            } else {
                Alpine.store('global').showToast(data.error || 'Toggle failed', 'error');
            }
        } catch (e) {
            Alpine.store('global').showToast('Toggle failed: ' + e.message, 'error');
        }
    },

    async fixAccount(email) {
        Alpine.store('global').showToast(`Re-authenticating ${email}...`, 'info');
        const password = Alpine.store('global').webuiPassword;
        try {
            const urlPath = `/api/auth/url?email=${encodeURIComponent(email)}`;
            const { response, newPassword } = await window.utils.request(urlPath, {}, password);
            if (newPassword) Alpine.store('global').webuiPassword = newPassword;

            const data = await response.json();
            if (data.status === 'ok') {
                window.open(data.url, 'google_oauth', 'width=600,height=700,scrollbars=yes');
            } else {
                Alpine.store('global').showToast(data.error || 'Failed to get auth URL', 'error');
            }
        } catch (e) {
            Alpine.store('global').showToast('Failed: ' + e.message, 'error');
        }
    },

    async deleteAccount(email) {
        if (!confirm(Alpine.store('global').t('confirmDelete'))) return;
        const password = Alpine.store('global').webuiPassword;
        try {
            const { response, newPassword } = await window.utils.request(`/api/accounts/${encodeURIComponent(email)}`, { method: 'DELETE' }, password);
            if (newPassword) Alpine.store('global').webuiPassword = newPassword;

            const data = await response.json();
            if (data.status === 'ok') {
                Alpine.store('global').showToast(`Deleted ${email}`, 'success');
                Alpine.store('data').fetchData();
            } else {
                Alpine.store('global').showToast(data.error || 'Delete failed', 'error');
            }
        } catch (e) {
            Alpine.store('global').showToast('Delete failed: ' + e.message, 'error');
        }
    },

    async reloadAccounts() {
        const password = Alpine.store('global').webuiPassword;
        try {
            const { response, newPassword } = await window.utils.request('/api/accounts/reload', { method: 'POST' }, password);
            if (newPassword) Alpine.store('global').webuiPassword = newPassword;

            const data = await response.json();
            if (data.status === 'ok') {
                Alpine.store('global').showToast('Accounts reloaded', 'success');
                Alpine.store('data').fetchData();
            } else {
                Alpine.store('global').showToast(data.error || 'Reload failed', 'error');
            }
        } catch (e) {
            Alpine.store('global').showToast('Reload failed: ' + e.message, 'error');
        }
    }
});
