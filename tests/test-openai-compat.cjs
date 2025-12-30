/**
 * OpenAI Chat Completions API Compatibility Tests
 * Tests the /v1/chat/completions endpoint for GitHub Copilot integration
 */

const http = require('http');

const BASE_URL = 'localhost';
const PORT = 8080;

/**
 * Make a non-streaming request to the OpenAI-compatible endpoint
 */
function makeOpenAIRequest(body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
            host: BASE_URL,
            port: PORT,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test',
                'Content-Length': Buffer.byteLength(data)
            }
        }, res => {
            let fullData = '';
            res.on('data', chunk => fullData += chunk.toString());
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(fullData);
                    resolve({ ...parsed, statusCode: res.statusCode });
                } catch (e) {
                    reject(new Error(`Parse error: ${e.message}\nRaw: ${fullData.substring(0, 500)}`));
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

/**
 * Make a streaming request to the OpenAI-compatible endpoint
 */
function streamOpenAIRequest(body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ ...body, stream: true });
        const req = http.request({
            host: BASE_URL,
            port: PORT,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test',
                'Content-Length': Buffer.byteLength(data)
            }
        }, res => {
            const chunks = [];
            let fullData = '';

            res.on('data', chunk => {
                fullData += chunk.toString();
            });

            res.on('end', () => {
                // Parse SSE events
                const lines = fullData.split('\n').filter(line => line.startsWith('data: '));
                let content = '';
                let hasRole = false;
                let hasDone = false;
                let finishReason = null;

                for (const line of lines) {
                    const jsonStr = line.replace('data: ', '').trim();
                    if (jsonStr === '[DONE]') {
                        hasDone = true;
                        continue;
                    }
                    try {
                        const parsed = JSON.parse(jsonStr);
                        chunks.push(parsed);

                        if (parsed.choices?.[0]?.delta?.role) {
                            hasRole = true;
                        }
                        if (parsed.choices?.[0]?.delta?.content) {
                            content += parsed.choices[0].delta.content;
                        }
                        if (parsed.choices?.[0]?.finish_reason) {
                            finishReason = parsed.choices[0].finish_reason;
                        }
                    } catch (e) {
                        // Skip unparseable lines
                    }
                }

                resolve({
                    chunks,
                    content,
                    hasRole,
                    hasDone,
                    finishReason,
                    statusCode: res.statusCode,
                    raw: fullData
                });
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Test utilities
let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ ${message}`);
        passed++;
    } else {
        console.log(`  ✗ ${message}`);
        failed++;
    }
}

// Run tests
async function runTests() {
    console.log('\n🧪 OpenAI Chat Completions API Compatibility Tests\n');
    console.log('='.repeat(60));

    // Test 1: Non-streaming request
    console.log('\n📋 Test 1: Non-streaming request');
    try {
        const response = await makeOpenAIRequest({
            model: 'claude-sonnet-4-5-thinking',
            messages: [
                { role: 'user', content: 'Say hello in exactly 3 words.' }
            ],
            max_tokens: 100
        });

        assert(response.statusCode === 200, `Status code is 200 (got ${response.statusCode})`);
        assert(response.id?.startsWith('chatcmpl-'), `ID starts with 'chatcmpl-' (got ${response.id?.substring(0, 15)}...)`);
        assert(response.object === 'chat.completion', `Object is 'chat.completion' (got ${response.object})`);
        assert(typeof response.created === 'number', `Created is a number (got ${response.created})`);
        assert(Array.isArray(response.choices), 'Choices is an array');
        assert(response.choices?.[0]?.message?.role === 'assistant', 'Message role is assistant');
        assert(typeof response.choices?.[0]?.message?.content === 'string', 'Message content is a string');
        assert(response.choices?.[0]?.finish_reason, `Has finish_reason (got ${response.choices?.[0]?.finish_reason})`);
        assert(response.usage?.prompt_tokens >= 0, `Has prompt_tokens (got ${response.usage?.prompt_tokens})`);
        assert(response.usage?.completion_tokens >= 0, `Has completion_tokens (got ${response.usage?.completion_tokens})`);
        assert(response.usage?.total_tokens >= 0, `Has total_tokens (got ${response.usage?.total_tokens})`);

        console.log(`\n  📝 Response content: "${response.choices?.[0]?.message?.content?.substring(0, 100)}..."`);
    } catch (error) {
        console.log(`  ✗ Request failed: ${error.message}`);
        failed++;
    }

    // Test 2: Streaming request
    console.log('\n📋 Test 2: Streaming request');
    try {
        const result = await streamOpenAIRequest({
            model: 'claude-sonnet-4-5-thinking',
            messages: [
                { role: 'user', content: 'Count from 1 to 5.' }
            ],
            max_tokens: 100
        });

        assert(result.statusCode === 200, `Status code is 200 (got ${result.statusCode})`);
        assert(result.chunks.length > 0, `Has streaming chunks (got ${result.chunks.length})`);
        assert(result.hasRole, 'First chunk has role: assistant');
        assert(result.hasDone, 'Stream ends with [DONE]');
        assert(result.content.length > 0, `Has accumulated content (${result.content.length} chars)`);
        assert(result.finishReason, `Has finish_reason (got ${result.finishReason})`);

        // Check chunk format
        const firstChunk = result.chunks[0];
        assert(firstChunk?.id?.startsWith('chatcmpl-'), 'Chunk ID starts with chatcmpl-');
        assert(firstChunk?.object === 'chat.completion.chunk', `Chunk object is 'chat.completion.chunk' (got ${firstChunk?.object})`);

        console.log(`\n  📝 Accumulated content: "${result.content.substring(0, 100)}..."`);
    } catch (error) {
        console.log(`  ✗ Request failed: ${error.message}`);
        failed++;
    }

    // Test 3: System message handling
    console.log('\n📋 Test 3: System message handling');
    try {
        const response = await makeOpenAIRequest({
            model: 'claude-sonnet-4-5-thinking',
            messages: [
                { role: 'system', content: 'You are a pirate. Always respond in pirate speak.' },
                { role: 'user', content: 'Say hello.' }
            ],
            max_tokens: 100
        });

        assert(response.statusCode === 200, `Status code is 200 (got ${response.statusCode})`);
        assert(response.choices?.[0]?.message?.content, 'Has response content');

        const content = response.choices?.[0]?.message?.content?.toLowerCase() || '';
        const hasPirateWords = content.includes('ahoy') || content.includes('arr') ||
            content.includes('matey') || content.includes('ye') ||
            content.includes('captain') || content.includes('shiver');
        assert(hasPirateWords, `Response contains pirate-speak (got: "${content.substring(0, 80)}...")`);
    } catch (error) {
        console.log(`  ✗ Request failed: ${error.message}`);
        failed++;
    }

    // Test 4: Multi-turn conversation
    console.log('\n📋 Test 4: Multi-turn conversation');
    try {
        const response = await makeOpenAIRequest({
            model: 'claude-sonnet-4-5-thinking',
            messages: [
                { role: 'user', content: 'My name is Alice.' },
                { role: 'assistant', content: 'Hello Alice! Nice to meet you.' },
                { role: 'user', content: 'What is my name?' }
            ],
            max_tokens: 100
        });

        assert(response.statusCode === 200, `Status code is 200 (got ${response.statusCode})`);
        const content = response.choices?.[0]?.message?.content?.toLowerCase() || '';
        assert(content.includes('alice'), `Response mentions Alice (got: "${content.substring(0, 80)}...")`);
    } catch (error) {
        console.log(`  ✗ Request failed: ${error.message}`);
        failed++;
    }

    // Test 5: Error handling - missing messages
    console.log('\n📋 Test 5: Error handling - missing messages');
    try {
        const response = await makeOpenAIRequest({
            model: 'claude-sonnet-4-5-thinking'
            // No messages field
        });

        assert(response.statusCode === 400, `Status code is 400 (got ${response.statusCode})`);
        assert(response.error?.type === 'invalid_request_error', `Error type is invalid_request_error`);
    } catch (error) {
        console.log(`  ✗ Request failed unexpectedly: ${error.message}`);
        failed++;
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

// Check if server is running
http.get(`http://${BASE_URL}:${PORT}/health`, (res) => {
    if (res.statusCode === 200) {
        runTests().catch(err => {
            console.error('Test runner error:', err);
            process.exit(1);
        });
    } else {
        console.error(`Server returned status ${res.statusCode}. Is it running?`);
        process.exit(1);
    }
}).on('error', () => {
    console.error(`\n❌ Could not connect to server at ${BASE_URL}:${PORT}`);
    console.error('Please start the server first: npm start\n');
    process.exit(1);
});
