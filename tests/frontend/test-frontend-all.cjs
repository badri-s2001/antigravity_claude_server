/**
 * Frontend Test Runner
 * Runs all frontend test suites
 * 
 * Run: node tests/frontend/test-frontend-all.cjs
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

const testFiles = [
    'test-frontend-dashboard.cjs',
    'test-frontend-logs.cjs',
    'test-frontend-accounts.cjs',
    'test-frontend-settings.cjs'
];

async function runTests() {
    console.log('🚀 Running All Frontend Tests\n');
    console.log('═'.repeat(60));

    let totalPassed = 0;
    let totalFailed = 0;
    const results = [];

    for (const testFile of testFiles) {
        const testPath = path.join(__dirname, testFile);
        console.log(`\n📋 Running: ${testFile}`);
        console.log('─'.repeat(60));

        try {
            const output = execSync(`node "${testPath}"`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            console.log(output);

            // Parse results from output
            const match = output.match(/Results: (\d+) passed, (\d+) failed/);
            if (match) {
                const passed = parseInt(match[1]);
                const failed = parseInt(match[2]);
                totalPassed += passed;
                totalFailed += failed;
                results.push({ file: testFile, passed, failed, status: 'completed' });
            }
        } catch (error) {
            console.log(error.stdout || '');
            console.log(error.stderr || '');

            // Try to parse results even on failure
            const output = error.stdout || '';
            const match = output.match(/Results: (\d+) passed, (\d+) failed/);
            if (match) {
                const passed = parseInt(match[1]);
                const failed = parseInt(match[2]);
                totalPassed += passed;
                totalFailed += failed;
                results.push({ file: testFile, passed, failed, status: 'completed with errors' });
            } else {
                results.push({ file: testFile, passed: 0, failed: 1, status: 'crashed' });
                totalFailed++;
            }
        }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📊 SUMMARY\n');

    for (const result of results) {
        const icon = result.failed === 0 ? '✅' : '❌';
        console.log(`${icon} ${result.file}: ${result.passed} passed, ${result.failed} failed (${result.status})`);
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`Total: ${totalPassed} passed, ${totalFailed} failed`);
    console.log('═'.repeat(60));

    process.exit(totalFailed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test runner crashed:', err);
    process.exit(1);
});
