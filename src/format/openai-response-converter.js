/**
 * OpenAI Response Converter
 * Converts Google Generative AI responses to OpenAI Chat Completions format
 */

import crypto from 'crypto';

/**
 * Convert internal/Anthropic response to OpenAI Chat Completions format
 *
 * @param {Object} anthropicResponse - Anthropic format response
 * @param {string} model - The model name used
 * @returns {Object} OpenAI Chat Completions format response
 */
export function convertToOpenAI(anthropicResponse, model) {
    const id = `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
    const created = Math.floor(Date.now() / 1000);

    // Extract text and tool calls from content
    const content = anthropicResponse.content || [];
    let textContent = '';
    const toolCalls = [];

    for (const block of content) {
        if (block.type === 'text') {
            textContent += block.text || '';
        } else if (block.type === 'thinking') {
            // Include thinking in text for transparency (optional)
            // Skip for now to match standard OpenAI format
        } else if (block.type === 'tool_use') {
            toolCalls.push({
                id: block.id || `call_${crypto.randomBytes(8).toString('hex')}`,
                type: 'function',
                function: {
                    name: block.name,
                    arguments: JSON.stringify(block.input || {})
                }
            });
        }
    }

    // Map stop reason to OpenAI finish_reason
    let finishReason = 'stop';
    if (anthropicResponse.stop_reason === 'max_tokens') {
        finishReason = 'length';
    } else if (anthropicResponse.stop_reason === 'tool_use' || toolCalls.length > 0) {
        finishReason = 'tool_calls';
    } else if (anthropicResponse.stop_reason === 'end_turn') {
        finishReason = 'stop';
    }

    // Build message
    const message = {
        role: 'assistant',
        content: textContent || null
    };

    if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
        if (!message.content) {
            message.content = null; // OpenAI expects null content with tool_calls
        }
    }

    // Build usage
    const usage = {
        prompt_tokens: (anthropicResponse.usage?.input_tokens || 0) +
            (anthropicResponse.usage?.cache_read_input_tokens || 0),
        completion_tokens: anthropicResponse.usage?.output_tokens || 0,
        total_tokens: 0
    };
    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;

    return {
        id,
        object: 'chat.completion',
        created,
        model,
        choices: [{
            index: 0,
            message,
            finish_reason: finishReason
        }],
        usage
    };
}

/**
 * Create an OpenAI streaming chunk
 *
 * @param {string} id - The completion ID
 * @param {string} model - The model name
 * @param {Object} delta - The delta content
 * @param {string|null} finishReason - The finish reason (null if not done)
 * @returns {Object} OpenAI streaming chunk
 */
export function createStreamChunk(id, model, delta, finishReason = null) {
    return {
        id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
            index: 0,
            delta,
            finish_reason: finishReason
        }]
    };
}

/**
 * Generator that converts Anthropic SSE events to OpenAI streaming format
 *
 * @param {AsyncGenerator} anthropicEvents - Generator yielding Anthropic SSE events
 * @param {string} model - The model name
 * @yields {string} SSE-formatted lines for OpenAI streaming
 */
export async function* streamToOpenAIFormat(anthropicEvents, model) {
    const id = `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
    let isFirstChunk = true;
    let currentToolCall = null;
    let toolCallIndex = 0;

    for await (const event of anthropicEvents) {
        // First chunk sends the role
        if (isFirstChunk && event.type === 'message_start') {
            isFirstChunk = false;
            yield `data: ${JSON.stringify(createStreamChunk(id, model, { role: 'assistant' }))}\n\n`;
            continue;
        }

        // Handle content block start
        if (event.type === 'content_block_start') {
            const block = event.content_block;
            if (block?.type === 'tool_use') {
                // Start of a tool call
                currentToolCall = {
                    index: toolCallIndex,
                    id: block.id || `call_${crypto.randomBytes(8).toString('hex')}`,
                    type: 'function',
                    function: {
                        name: block.name,
                        arguments: ''
                    }
                };
                // Send initial tool call chunk
                yield `data: ${JSON.stringify(createStreamChunk(id, model, {
                    tool_calls: [{
                        index: currentToolCall.index,
                        id: currentToolCall.id,
                        type: 'function',
                        function: {
                            name: currentToolCall.function.name,
                            arguments: ''
                        }
                    }]
                }))}\n\n`;
            }
            continue;
        }

        // Handle content deltas
        if (event.type === 'content_block_delta') {
            const delta = event.delta;

            if (delta?.type === 'text_delta' && delta.text) {
                yield `data: ${JSON.stringify(createStreamChunk(id, model, { content: delta.text }))}\n\n`;
            } else if (delta?.type === 'thinking_delta') {
                // Skip thinking for standard OpenAI format
                // Could optionally include as content prefixed with marker
            } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
                // Accumulate tool arguments
                if (currentToolCall) {
                    yield `data: ${JSON.stringify(createStreamChunk(id, model, {
                        tool_calls: [{
                            index: currentToolCall.index,
                            function: {
                                arguments: delta.partial_json
                            }
                        }]
                    }))}\n\n`;
                }
            }
            continue;
        }

        // Handle content block stop
        if (event.type === 'content_block_stop') {
            if (currentToolCall) {
                toolCallIndex++;
                currentToolCall = null;
            }
            continue;
        }

        // Handle message delta (contains stop reason)
        if (event.type === 'message_delta') {
            let finishReason = 'stop';
            if (event.delta?.stop_reason === 'max_tokens') {
                finishReason = 'length';
            } else if (event.delta?.stop_reason === 'tool_use') {
                finishReason = 'tool_calls';
            }
            yield `data: ${JSON.stringify(createStreamChunk(id, model, {}, finishReason))}\n\n`;
            continue;
        }

        // Handle message stop
        if (event.type === 'message_stop') {
            yield 'data: [DONE]\n\n';
            continue;
        }
    }
}
