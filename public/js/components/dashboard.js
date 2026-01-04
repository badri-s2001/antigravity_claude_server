/**
 * Dashboard Component
 * Registers itself to window.Components for Alpine.js to consume
 */
window.Components = window.Components || {};

window.Components.dashboard = () => ({
    stats: { total: 0, active: 0, limited: 0, overallHealth: 0 },
    charts: { quotaDistribution: null },

    init() {
        // Update stats when dashboard becomes active
        this.$watch('$store.global.activeTab', (val) => {
            if (val === 'dashboard') {
                this.$nextTick(() => {
                    this.updateStats();
                    this.updateCharts();
                });
            }
        });

        // Watch for data changes
        this.$watch('$store.data.accounts', () => {
            if (this.$store.global.activeTab === 'dashboard') {
                this.updateStats();
                this.$nextTick(() => this.updateCharts());
            }
        });

        // Initial update if already on dashboard
        if (this.$store.global.activeTab === 'dashboard') {
            this.$nextTick(() => {
                this.updateStats();
                this.updateCharts();
            });
        }
    },

    updateStats() {
        const accounts = Alpine.store('data').accounts;
        let active = 0, limited = 0;
        accounts.forEach(acc => {
            if (acc.status === 'ok') {
                const hasQuota = Object.values(acc.limits || {}).some(l => l && l.remainingFraction > 0);
                if (hasQuota) active++; else limited++;
            } else {
                limited++;
            }
        });
        this.stats = { total: accounts.length, active, limited };
    },

    updateCharts() {
        const ctx = document.getElementById('quotaChart');
        if (!ctx || typeof Chart === 'undefined') return;

        if (this.charts.quotaDistribution) {
            this.charts.quotaDistribution.destroy();
        }

        const rows = Alpine.store('data').quotaRows;
        const familyStats = { claude: { sum: 0, count: 0 }, gemini: { sum: 0, count: 0 }, other: { sum: 0, count: 0 } };

        // Calculate overall system health
        let totalHealthSum = 0;
        let totalModelCount = 0;

        rows.forEach(row => {
            const f = familyStats[row.family] ? row.family : 'other';
            // Use avgQuota if available (new logic), fallback to minQuota (old logic compatibility)
            const quota = row.avgQuota !== undefined ? row.avgQuota : row.minQuota;

            familyStats[f].sum += quota;
            familyStats[f].count++;

            totalHealthSum += quota;
            totalModelCount++;
        });

        this.stats.overallHealth = totalModelCount > 0 ? Math.round(totalHealthSum / totalModelCount) : 0;

        const labels = ['Claude', 'Gemini', 'Other'];
        const data = [
            familyStats.claude.count ? Math.round(familyStats.claude.sum / familyStats.claude.count) : 0,
            familyStats.gemini.count ? Math.round(familyStats.gemini.sum / familyStats.gemini.count) : 0,
            familyStats.other.count ? Math.round(familyStats.other.sum / familyStats.other.count) : 0,
        ];

        this.charts.quotaDistribution = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: ['#a855f7', '#22c55e', '#52525b'],
                    borderColor: '#09090b', // Matches bg-space-900 roughly
                    borderWidth: 2,
                    hoverOffset: 0,
                    borderRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '85%', // Thinner ring
                plugins: {
                    legend: {
                        display: false // Hide default legend
                    },
                    tooltip: {
                        enabled: false // Disable tooltip for cleaner look, or style it? Let's keep it simple.
                    },
                    title: { display: false }
                },
                animation: {
                    animateScale: true,
                    animateRotate: true
                }
            }
        });
    }
});
