/**
 * Format Converter Module
 * Converts between Anthropic Messages API format and Google Generative AI format
 * Also supports OpenAI Chat Completions API format conversion
 */

// Re-export all from each module
export * from './request-converter.js';
export * from './response-converter.js';
export * from './content-converter.js';
export * from './schema-sanitizer.js';
export * from './thinking-utils.js';

// OpenAI format converters
export * from './openai-request-converter.js';
export * from './openai-response-converter.js';

// Default export for backward compatibility
import { convertAnthropicToGoogle } from './request-converter.js';
import { convertGoogleToAnthropic } from './response-converter.js';
import { convertOpenAIToInternal } from './openai-request-converter.js';
import { convertToOpenAI, streamToOpenAIFormat } from './openai-response-converter.js';

export default {
    convertAnthropicToGoogle,
    convertGoogleToAnthropic,
    convertOpenAIToInternal,
    convertToOpenAI,
    streamToOpenAIFormat
};
