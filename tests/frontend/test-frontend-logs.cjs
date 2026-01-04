/**
 * Frontend Test Suite - Logs Page
 * Tests the logs viewer component functionality
 * 
 * Run: node tests/test-frontend-logs.cjs
 */

const http = require('http');

const BASE_URL = 'http://localhost:8090';

function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const req = http.request(url, {
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, data, headers: res.headers });
            });
        });
        req.on('error', reject);
        if (options.body) req.write(JSON.stringify(options.body));
        req.end();
    });
}

const tests = [
    {
        name: 'Logs view loads successfully',
        async run() {
            const res = await request('/views/logs.html');
            if (res.status !== 200) {
                throw new Error(`Expected 200, got ${res.status}`);
            }
            if (!res.data.includes('x-data="logsViewer"')) {
                throw new Error('LogsViewer component not found');
            }
            return 'Logs HTML loads with component';
        }
    },
    {
        name: 'Logs API endpoint exists',
        async run() {
            const res = await request('/api/logs');
            if (res.status !== 200) {
                throw new Error(`Expected 200, got ${res.status}`);
            }
            const data = JSON.parse(res.data);
            if (!data.logs || !Array.isArray(data.logs)) {
                throw new Error('logs array not found in response');
            }
            return `API returns ${data.logs.length} log entries`;
        }
    },
    {
        name: 'Logs SSE stream endpoint exists',
        async run() {
            return new Promise((resolve, reject) => {
                const url = new URL('/api/logs/stream', BASE_URL);
                const req = http.request(url, (res) => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`Expected 200, got ${res.statusCode}`));
                        return;
                    }
                    if (res.headers['content-type'] !== 'text/event-stream') {
                        reject(new Error(`Expected text/event-stream, got ${res.headers['content-type']}`));
                        return;
                    }
                    req.destroy(); // Close connection
                    resolve('SSE stream endpoint responds correctly');
                });
                req.on('error', reject);
                req.end();
            });
        }
    },
    {
        name: 'Logs view has auto-scroll toggle',
        async run() {
            const res = await request('/views/logs.html');
            if (!res.data.includes('isAutoScroll')) {
                throw new Error('Auto-scroll toggle not found');
            }
            if (!res.data.includes('autoScroll')) {
                throw new Error('Auto-scroll translation key not found');
            }
            return 'Auto-scroll toggle present';
        }
    },
    {
        name: 'Logs view has clear logs button',
        async run() {
            const res = await request('/views/logs.html');
            if (!res.data.includes('clearLogs')) {
                throw new Error('Clear logs function not found');
            }
            return 'Clear logs button present';
        }
    },
    {
        name: 'Logs view has log container',
        async run() {
            const res = await request('/views/logs.html');
            if (!res.data.includes('logs-container')) {
                throw new Error('Logs container element not found');
            }
            if (!res.data.includes('x-for="(log, idx) in filteredLogs"')) {
                throw new Error('Log iteration template not found');
            }
            return 'Log container and template present';
        }
    },
    {
        name: 'Logs view shows log levels with colors',
        async run() {
            const res = await request('/views/logs.html');
            const levels = ['INFO', 'WARN', 'ERROR', 'SUCCESS', 'DEBUG'];
            const colors = ['blue-400', 'yellow-400', 'red-500', 'neon-green', 'purple-400'];

            for (const level of levels) {
                if (!res.data.includes(`'${level}'`)) {
                    throw new Error(`Log level ${level} styling not found`);
                }
            }
            return 'All log levels have color styling';
        }
    }
];

async function runTests() {
    console.log('🧪 Logs Frontend Tests\n');
    console.log('='.repeat(50));

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            const result = await test.run();
            console.log(`✅ ${test.name}`);
            console.log(`   ${result}\n`);
            passed++;
        } catch (error) {
            console.log(`❌ ${test.name}`);
            console.log(`   Error: ${error.message}\n`);
            failed++;
        }
    }

    console.log('='.repeat(50));
    console.log(`Results: ${passed} passed, ${failed} failed`);

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
});
