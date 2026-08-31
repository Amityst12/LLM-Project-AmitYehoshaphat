import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpenRouterService,
  DEFAULT_MODEL,
  calculateTokenCostUsd,
} from '../../src/server/services/openrouter.js';

describe('OpenRouterService (Unit)', () => {
  const originalEnv = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = originalEnv;
  });

  it('should throw an explicit error when OPENROUTER_API_KEY is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const service = new OpenRouterService(undefined, 'https://mock.api');

    await expect(
      service.completeChat({
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).rejects.toThrow('OPENROUTER_API_KEY is not set');
  });

  it('should successfully complete chat and calculate tokens and latency', async () => {
    const service = new OpenRouterService('test-key', 'https://mock.api');

    const mockResponseData = {
      model: 'google/gemini-2.0-flash-001',
      choices: [{ message: { content: 'Verdict argument content' } }],
      usage: {
        prompt_tokens: 150,
        completion_tokens: 75,
        total_tokens: 225,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponseData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await service.completeChat({
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.5,
      maxTokens: 500,
      timeoutMs: 5000,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://mock.api/chat/completions');
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      }),
    );

    expect(result.content).toBe('Verdict argument content');
    expect(result.model).toBe('google/gemini-2.0-flash-001');
    expect(result.tokens.promptTokens).toBe(150);
    expect(result.tokens.completionTokens).toBe(75);
    expect(result.tokens.totalTokens).toBe(225);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.costUsd).toBe(
      calculateTokenCostUsd('google/gemini-2.0-flash-001', 150, 75),
    );
  });

  it('should handle missing usage data gracefully with fallback to 0', async () => {
    const service = new OpenRouterService('test-key', 'https://mock.api');

    const mockResponseData = {
      choices: [{ message: { content: 'No usage provided' } }],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponseData), { status: 200 }),
    );

    const result = await service.completeChat({
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result.content).toBe('No usage provided');
    expect(result.model).toBe(DEFAULT_MODEL);
    expect(result.tokens.totalTokens).toBe(0);
    expect(result.costUsd).toBe(0);
  });

  it('should throw formatted error on HTTP error response from OpenRouter', async () => {
    const service = new OpenRouterService('test-key', 'https://mock.api');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Rate limit exceeded', { status: 429 }),
    );

    await expect(
      service.completeChat({
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).rejects.toThrow('OpenRouter API error (status 429): Rate limit exceeded');
  });

  it('should throw clear timeout error on abort', async () => {
    const service = new OpenRouterService('test-key', 'https://mock.api');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      return new Promise((_resolve, reject) => {
        const signal = options?.signal as AbortSignal;
        signal.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    });

    await expect(
      service.completeChat({
        messages: [{ role: 'user', content: 'timeout test' }],
        timeoutMs: 50,
      }),
    ).rejects.toThrow('OpenRouter API call timed out after 50ms');
  });
});
