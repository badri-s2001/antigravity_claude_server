/**
 * Retry Utilities with Exponential Backoff
 *
 * Provides retry logic with exponential backoff and jitter
 * to prevent thundering herd and optimize API quota usage.
 */

import { sleep } from './helpers.js';
import { logger } from './logger.js';

/**
 * Calculate exponential backoff delay with jitter
 *
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseMs - Base delay in milliseconds
 * @param {number} maxMs - Maximum delay in milliseconds
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoff(attempt, baseMs = 1000, maxMs = 30000) {
    // Exponential: baseMs * 2^attempt
    const exponential = baseMs * Math.pow(2, attempt);

    // Cap at max
    const capped = Math.min(exponential, maxMs);

    // Add random jitter (±25%) to prevent thundering herd
    const jitter = capped * 0.25 * (Math.random() * 2 - 1);

    return Math.floor(capped + jitter);
}

/**
 * Retry a function with exponential backoff
 *
 * @param {Function} fn - Async function to retry (receives attempt number)
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Maximum number of attempts (default: 5)
 * @param {number} options.baseMs - Base delay in milliseconds (default: 1000)
 * @param {number} options.maxMs - Maximum delay in milliseconds (default: 30000)
 * @param {Function} options.shouldRetry - Function to determine if error is retryable
 * @param {Function} options.onRetry - Callback before each retry (error, attempt, backoffMs)
 * @returns {Promise<any>} Result from fn
 * @throws {Error} Last error if all attempts fail
 */
export async function retryWithBackoff(fn, options = {}) {
    const {
        maxAttempts = 5,
        baseMs = 1000,
        maxMs = 30000,
        shouldRetry = () => true,
        onRetry = null
    } = options;

    let lastError;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn(attempt);
        } catch (error) {
            lastError = error;

            // Check if this is the last attempt
            if (attempt === maxAttempts - 1) {
                logger.debug(`[Retry] All ${maxAttempts} attempts exhausted`);
                throw error;
            }

            // Check if error is retryable
            if (!shouldRetry(error, attempt)) {
                logger.debug(`[Retry] Error not retryable, aborting: ${error.message}`);
                throw error;
            }

            // Calculate backoff
            const backoffMs = calculateBackoff(attempt, baseMs, maxMs);
            logger.debug(`[Retry] Attempt ${attempt + 1}/${maxAttempts} failed, retrying in ${backoffMs}ms`);

            // Call onRetry callback
            if (onRetry) {
                await onRetry(error, attempt, backoffMs);
            }

            // Wait before retrying
            await sleep(backoffMs);
        }
    }

    // Should never reach here, but just in case
    throw lastError;
}

/**
 * Check if an error is retryable (5xx errors or network issues)
 *
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(error) {
    const message = error.message?.toLowerCase() || '';

    // Network errors
    if (message.includes('econnrefused') ||
        message.includes('econnreset') ||
        message.includes('etimedout') ||
        message.includes('network') ||
        message.includes('fetch failed')) {
        return true;
    }

    // 5xx server errors
    if (message.includes('500') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')) {
        return true;
    }

    // Rate limits (429) are retryable
    if (message.includes('429') || message.includes('rate limit')) {
        return true;
    }

    return false;
}

/**
 * Check if an error is NOT retryable (4xx client errors except 429)
 *
 * @param {Error} error - Error to check
 * @returns {boolean} True if error should not be retried
 */
export function isNonRetryableError(error) {
    const message = error.message?.toLowerCase() || '';

    // Authentication errors (401, 403)
    if (message.includes('401') ||
        message.includes('403') ||
        message.includes('unauthorized') ||
        message.includes('forbidden')) {
        return true;
    }

    // Bad request (400)
    if (message.includes('400') || message.includes('bad request')) {
        return true;
    }

    // Not found (404)
    if (message.includes('404') || message.includes('not found')) {
        return true;
    }

    return false;
}

export default {
    calculateBackoff,
    retryWithBackoff,
    isRetryableError,
    isNonRetryableError
};
