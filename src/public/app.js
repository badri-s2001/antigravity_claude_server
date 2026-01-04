/**
 * Antigravity Proxy Dashboard - Crazy Edition
 * Real-time quota monitoring with live account tracking
 */

// ============================================
// State Management
// ============================================

let dashboardData = null;
let liveData = null;
let currentView = 'cards';
let quotaScope = 'all'; // 'all' or 'current'

// ============================================
// Utility Functions
// ============================================

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function timeAgo(timestamp) {
    if (!timestamp) return 'Never';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function formatCountdown(ms) {
    if (ms <= 0) return '00:00';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDuration(ms) {
    if (ms <= 0) return 'now';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

function getQuotaLevel(fraction) {
    if (fraction === null || fraction === undefined) return 'low';
    if (fraction >= 0.5) return 'high';
    if (fraction >= 0.2) return 'medium';
    return 'low';
}

function getModelFamily(modelId) {
    if (modelId.includes('claude')) return 'claude';
    if (modelId.includes('gemini')) return 'gemini';
    return 'other';
}

function shortenModelName(modelId) {
    return modelId
        .replace('claude-', 'c-')
        .replace('gemini-', 'g-')
        .replace('-thinking', '-th')
        .replace('-sonnet', '-son')
        .replace('-opus', '-op');
}

function truncateEmail(email) {
    if (!email) return '-';
    const parts = email.split('@');
    if (parts[0].length > 12) {
        return parts[0].substring(0, 10) + '..@' + parts[1];
    }
    return email;
}

// ============================================
// Rendering Functions
// ============================================

function renderLiveBanner(data) {
    const live = data.live || {};

    // Current account - show full email
    const currentAccountEl = document.getElementById('current-account');
    currentAccountEl.textContent = live.currentAccount || 'None';

    // Last model - show full model name
    const lastModelEl = document.getElementById('last-model');
    lastModelEl.textContent = live.lastActiveModel || '-';

    const requestCountEl = document.getElementById('request-count');
    const oldCount = parseInt(requestCountEl.textContent) || 0;
    const newCount = live.requestCount || 0;
    if (newCount > oldCount) {
        requestCountEl.classList.add('pulse-animation');
        setTimeout(() => requestCountEl.classList.remove('pulse-animation'), 300);
    }
    requestCountEl.textContent = newCount;
}

function renderQuotasOverview(data) {
    const container = document.getElementById('quotas-grid');
    const scopeLabel = document.getElementById('quota-scope-label');

    if (!data.models || data.models.length === 0) {
        container.innerHTML = '<div class="loading-shimmer"></div>';
        return;
    }

    const currentEmail = data.live?.currentAccount;
    const currentAccount = data.accounts.find(a => a.email === currentEmail);

    // Update scope label
    if (quotaScope === 'current') {
        scopeLabel.textContent = currentEmail ? `(${currentEmail})` : '(No active account)';
    } else {
        scopeLabel.textContent = '(Overall Average)';
    }

    // Build quota data based on scope
    const modelQuotas = {};

    if (quotaScope === 'current' && currentAccount) {
        // Show only current account's quotas
        data.models.forEach(modelId => {
            const quota = currentAccount.quotas?.[modelId];
            modelQuotas[modelId] = {
                value: quota?.remainingFraction ?? null,
                resetTime: quota?.resetTime ? new Date(quota.resetTime).getTime() : null
            };
        });
    } else {
        // Aggregate quotas across all accounts for each model
        data.models.forEach(modelId => {
            let totalQuota = 0;
            let accountCount = 0;
            let earliestReset = null;

            data.accounts.forEach(account => {
                if (account.quotas && account.quotas[modelId]) {
                    const quota = account.quotas[modelId];
                    if (quota.remainingFraction !== null) {
                        totalQuota += quota.remainingFraction;
                        accountCount++;
                    }
                    if (quota.resetTime) {
                        const resetMs = new Date(quota.resetTime).getTime();
                        if (!earliestReset || resetMs < earliestReset) {
                            earliestReset = resetMs;
                        }
                    }
                }
            });

            modelQuotas[modelId] = {
                value: accountCount > 0 ? totalQuota / accountCount : null,
                resetTime: earliestReset
            };
        });
    }

    container.innerHTML = data.models.map(modelId => {
        const quota = modelQuotas[modelId];
        const pct = quota.value !== null ? Math.round(quota.value * 100) : 0;
        const level = getQuotaLevel(quota.value);
        const family = getModelFamily(modelId);

        let resetInfo = '';
        if (quota.resetTime && quota.resetTime > Date.now()) {
            resetInfo = `<div class="quota-reset active">Resets in ${formatDuration(quota.resetTime - Date.now())}</div>`;
        } else if (quota.value === 0) {
            resetInfo = '<div class="quota-reset">Exhausted</div>';
        }

        return `
            <div class="quota-card">
                <div class="quota-header">
                    <span class="quota-model ${family}">${modelId}</span>
                    <span class="quota-percentage ${level}">${pct}%</span>
                </div>
                <div class="quota-bar">
                    <div class="quota-bar-fill ${level}" style="width: ${pct}%"></div>
                </div>
                ${resetInfo}
            </div>
        `;
    }).join('');
}

function renderAccountCards(data) {
    const container = document.getElementById('accounts-cards');
    const currentEmail = data.live?.currentAccount;

    if (!data.accounts || data.accounts.length === 0) {
        container.innerHTML = '<div class="loading-shimmer"></div>';
        return;
    }

    container.innerHTML = data.accounts.map(account => {
        const isCurrent = account.email === currentEmail;
        const statusClass = account.status === 'active' ? 'active' :
                           account.status === 'rate-limited' ? 'rate-limited' :
                           account.status === 'invalid' ? 'invalid' : 'error';

        const cardClass = isCurrent ? 'current' :
                         account.status === 'rate-limited' ? 'rate-limited' :
                         account.status === 'invalid' ? 'invalid' : '';

        const badgeText = isCurrent ? 'Current' :
                         account.status === 'active' ? 'Active' :
                         account.status === 'rate-limited' ? 'Limited' :
                         account.status === 'invalid' ? 'Invalid' : 'Error';

        const badgeClass = isCurrent ? 'current' : statusClass;

        // Render quota bars
        let quotasHtml = '';
        if (account.quotas && Object.keys(account.quotas).length > 0) {
            quotasHtml = Object.entries(account.quotas).map(([modelId, quota]) => {
                const pct = quota.remainingFraction !== null ? Math.round(quota.remainingFraction * 100) : 0;
                const level = getQuotaLevel(quota.remainingFraction);
                return `
                    <div class="account-quota-row">
                        <span class="account-quota-model" title="${modelId}">${shortenModelName(modelId)}</span>
                        <div class="account-quota-bar">
                            <div class="account-quota-fill ${level}" style="width: ${pct}%"></div>
                        </div>
                        <span class="account-quota-value ${level}">${pct}%</span>
                    </div>
                `;
            }).join('');
        } else {
            quotasHtml = '<div style="font-size: 0.6875rem; color: var(--text-muted);">No quota data</div>';
        }

        return `
            <div class="account-card ${cardClass}">
                <div class="account-header">
                    <div class="account-info">
                        <span class="account-email">${account.email}</span>
                        <span class="account-source">${account.source || 'OAuth'}</span>
                    </div>
                    <div class="account-badge ${badgeClass}">
                        <span class="badge-dot"></span>
                        ${badgeText}
                    </div>
                </div>
                <div class="account-meta">
                    <span>Last used: ${timeAgo(account.lastUsed)}</span>
                </div>
                ${account.error ? `<div class="error-message">${account.error}</div>` : ''}
                ${account.invalidReason ? `<div class="error-message">${account.invalidReason}</div>` : ''}
                <div class="account-quotas">
                    ${quotasHtml}
                </div>
            </div>
        `;
    }).join('');
}

function renderAccountTable(data) {
    const tbody = document.getElementById('accounts-table-body');
    const currentEmail = data.live?.currentAccount;

    if (!data.accounts || data.accounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4"><div class="loading-shimmer"></div></td></tr>';
        return;
    }

    tbody.innerHTML = data.accounts.map(account => {
        const isCurrent = account.email === currentEmail;
        const statusClass = account.status === 'active' ? 'active' :
                           account.status === 'rate-limited' ? 'rate-limited' :
                           account.status === 'invalid' ? 'invalid' : 'error';

        const badgeText = isCurrent ? 'Current' :
                         account.status === 'active' ? 'Active' :
                         account.status === 'rate-limited' ? 'Limited' :
                         account.status === 'invalid' ? 'Invalid' : 'Error';

        const badgeClass = isCurrent ? 'current' : statusClass;

        let quotasHtml = '';
        if (account.quotas && Object.keys(account.quotas).length > 0) {
            quotasHtml = Object.entries(account.quotas).map(([modelId, quota]) => {
                const pct = quota.remainingFraction !== null ? Math.round(quota.remainingFraction * 100) : 0;
                const level = getQuotaLevel(quota.remainingFraction);
                return `
                    <span class="table-quota-tag">
                        <span class="model">${shortenModelName(modelId)}</span>
                        <span class="value ${level}">${pct}%</span>
                    </span>
                `;
            }).join('');
        } else {
            quotasHtml = '<span style="color: var(--text-muted)">-</span>';
        }

        return `
            <tr>
                <td>
                    <div style="font-weight: 600; font-size: 0.875rem">${account.email}</div>
                    <div style="font-size: 0.6875rem; color: var(--text-muted); text-transform: uppercase">${account.source || 'OAuth'}</div>
                </td>
                <td>
                    <div class="account-badge ${badgeClass}">
                        <span class="badge-dot"></span>
                        ${badgeText}
                    </div>
                    ${account.error ? `<div class="error-message">${account.error}</div>` : ''}
                </td>
                <td style="font-size: 0.8125rem">${timeAgo(account.lastUsed)}</td>
                <td>
                    <div class="table-quotas">${quotasHtml}</div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderRateLimits(data) {
    const card = document.getElementById('rate-limits-card');
    const container = document.getElementById('rate-limits-list');

    // Collect all active rate limits
    const activeLimits = [];

    data.accounts.forEach(account => {
        if (account.modelRateLimits) {
            Object.entries(account.modelRateLimits).forEach(([modelId, limit]) => {
                if (limit.isRateLimited && limit.resetTime > Date.now()) {
                    activeLimits.push({
                        email: account.email,
                        model: modelId,
                        resetTime: limit.resetTime
                    });
                }
            });
        }
    });

    if (activeLimits.length === 0) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';

    container.innerHTML = activeLimits.map(limit => {
        const timeLeft = limit.resetTime - Date.now();
        return `
            <div class="rate-limit-card" data-reset="${limit.resetTime}">
                <div class="rate-limit-info">
                    <span class="rate-limit-account">${truncateEmail(limit.email)}</span>
                    <span class="rate-limit-model">${limit.model}</span>
                </div>
                <div class="rate-limit-timer">
                    <span class="rate-limit-countdown">${formatCountdown(timeLeft)}</span>
                    <span class="rate-limit-label">Until Reset</span>
                </div>
            </div>
        `;
    }).join('');
}

function updateCountdowns() {
    // Update rate limit countdowns
    document.querySelectorAll('.rate-limit-card').forEach(card => {
        const resetTime = parseInt(card.dataset.reset);
        const countdown = card.querySelector('.rate-limit-countdown');
        const timeLeft = resetTime - Date.now();

        if (timeLeft <= 0) {
            countdown.textContent = 'Resetting...';
        } else {
            countdown.textContent = formatCountdown(timeLeft);
        }
    });

    // Update uptime
    if (dashboardData) {
        const uptimeEl = document.getElementById('uptime');
        const elapsed = (Date.now() - dashboardData.timestamp) / 1000;
        uptimeEl.textContent = formatUptime(dashboardData.uptime + elapsed);
    }
}

// ============================================
// API Functions
// ============================================

async function fetchDashboardData() {
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn.classList.add('spinning');

    try {
        const response = await fetch('/api/dashboard/full');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        dashboardData = await response.json();

        // Update connection status
        const statusBadge = document.getElementById('connection-status');
        statusBadge.classList.remove('disconnected');
        statusBadge.classList.add('connected');
        statusBadge.querySelector('.status-text').textContent = 'Connected';

        // Update header
        document.getElementById('version').textContent = `v${dashboardData.version}`;
        document.getElementById('uptime').textContent = formatUptime(dashboardData.uptime);

        // Update summary stats
        document.getElementById('total-accounts').textContent = dashboardData.summary.total;
        document.getElementById('active-accounts').textContent = dashboardData.summary.available;
        document.getElementById('limited-accounts').textContent = dashboardData.summary.rateLimited;

        // Render all sections
        renderLiveBanner(dashboardData);
        renderQuotasOverview(dashboardData);
        renderAccountCards(dashboardData);
        renderAccountTable(dashboardData);
        renderRateLimits(dashboardData);

    } catch (err) {
        console.error('Dashboard fetch error:', err);
        const statusBadge = document.getElementById('connection-status');
        statusBadge.classList.remove('connected');
        statusBadge.classList.add('disconnected');
        statusBadge.querySelector('.status-text').textContent = 'Disconnected';
    } finally {
        refreshBtn.classList.remove('spinning');
    }
}

async function fetchLiveStatus() {
    try {
        const response = await fetch('/api/dashboard/live');
        if (!response.ok) return;

        liveData = await response.json();

        // Quick update of live banner elements - show full values
        const currentAccountEl = document.getElementById('current-account');
        currentAccountEl.textContent = liveData.currentAccount || 'None';

        const lastModelEl = document.getElementById('last-model');
        lastModelEl.textContent = liveData.lastActiveModel || '-';

        const requestCountEl = document.getElementById('request-count');
        const oldCount = parseInt(requestCountEl.textContent) || 0;
        const newCount = liveData.requestCount || 0;
        if (newCount > oldCount) {
            requestCountEl.style.transform = 'scale(1.2)';
            setTimeout(() => requestCountEl.style.transform = 'scale(1)', 200);
        }
        requestCountEl.textContent = newCount;

        // Update uptime
        document.getElementById('uptime').textContent = formatUptime(liveData.uptime);

    } catch (err) {
        // Silent fail for live status
    }
}

// ============================================
// View Toggle
// ============================================

function setView(view) {
    currentView = view;

    document.querySelectorAll('.view-toggle .toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    const cardsView = document.getElementById('accounts-cards');
    const tableView = document.getElementById('accounts-table-wrapper');

    if (view === 'cards') {
        cardsView.classList.remove('hidden');
        tableView.classList.add('hidden');
    } else {
        cardsView.classList.add('hidden');
        tableView.classList.remove('hidden');
    }
}

// ============================================
// Event Listeners
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Initial load
    fetchDashboardData();

    // Full refresh every 10 seconds
    setInterval(fetchDashboardData, 10000);

    // Live status poll every 2 seconds
    setInterval(fetchLiveStatus, 2000);

    // Countdown update every second
    setInterval(updateCountdowns, 1000);

    // Manual refresh button
    document.getElementById('refresh-btn').addEventListener('click', fetchDashboardData);

    // View toggle
    document.querySelectorAll('.view-toggle .toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => setView(btn.dataset.view));
    });

    // Quota scope toggle
    document.querySelectorAll('.quota-scope-toggle .scope-btn').forEach(btn => {
        btn.addEventListener('click', () => setQuotaScope(btn.dataset.scope));
    });
});

// ============================================
// Quota Scope Toggle
// ============================================

function setQuotaScope(scope) {
    quotaScope = scope;

    // Update button states
    document.querySelectorAll('.quota-scope-toggle .scope-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.scope === scope);
    });

    // Re-render quotas with new scope
    if (dashboardData) {
        renderQuotasOverview(dashboardData);
    }
}

// Add pulse animation style
const style = document.createElement('style');
style.textContent = `
    .pulse-animation {
        animation: value-pulse 0.3s ease-out;
    }
    @keyframes value-pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.3); color: var(--cyan); }
        100% { transform: scale(1); }
    }
`;
document.head.appendChild(style);
