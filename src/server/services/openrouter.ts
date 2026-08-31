import {
  OpenRouterCompletionParams,
  OpenRouterCompletionResult,
  TokenUsage,
} from '../types/tribunal.js';
import { circuitBreaker } from '../utils/circuitBreaker.js';

export const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Pricing per 1M tokens in USD */
export interface ModelPricing {
  promptUsdPerMillion: number;
  completionUsdPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'google/gemini-2.0-flash-001': {
    promptUsdPerMillion: 0.1,
    completionUsdPerMillion: 0.4,
  },
  'google/gemini-2.0-flash-lite-preview-02-05:free': {
    promptUsdPerMillion: 0.0,
    completionUsdPerMillion: 0.0,
  },
  'deepseek/deepseek-chat': {
    promptUsdPerMillion: 0.14,
    completionUsdPerMillion: 0.28,
  },
  'openai/gpt-4o-mini': {
    promptUsdPerMillion: 0.15,
    completionUsdPerMillion: 0.6,
  },
};

const DEFAULT_PRICING: ModelPricing = {
  promptUsdPerMillion: 0.2,
  completionUsdPerMillion: 0.5,
};

/**
 * Calculate token cost in USD based on model pricing table.
 */
export function calculateTokenCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const promptCost = (promptTokens / 1_000_000) * pricing.promptUsdPerMillion;
  const completionCost = (completionTokens / 1_000_000) * pricing.completionUsdPerMillion;
  return Number((promptCost + completionCost).toFixed(8));
}

/**
 * Service to execute chat completions via OpenRouter API.
 */
export class OpenRouterService {
  private apiKey: string | undefined;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl = 'https://openrouter.ai/api/v1') {
    this.apiKey = apiKey ?? process.env.OPENROUTER_API_KEY;
    this.baseUrl = baseUrl;
  }

  public async completeChat(
    params: OpenRouterCompletionParams,
  ): Promise<OpenRouterCompletionResult> {
    // 1. Enforce budget ceiling (Mitigation P2)
    circuitBreaker.enforceBudget();

    const key = this.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new Error(
        'OPENROUTER_API_KEY is not set in environment variables. Secrets must never be hardcoded.',
      );
    }

    const model = params.model ?? DEFAULT_MODEL;
    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const startTime = performance.now();

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/Amityst12/LLM-Project-AmitYehoshaphat',
          'X-Title': 'The Tribunal',
        },
        body: JSON.stringify({
          model,
          messages: params.messages,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens ?? 1024,
        }),
        signal: controller.signal,
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `OpenRouter API error (status ${response.status}): ${errorText.substring(0, 300)}`,
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const content = data.choices?.[0]?.message?.content ?? '';
      const tokens: TokenUsage = {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens:
          data.usage?.total_tokens ??
          (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0),
      };

      const actualModel = data.model ?? model;
      const costUsd = calculateTokenCostUsd(
        actualModel,
        tokens.promptTokens,
        tokens.completionTokens,
      );

      // 2. Record cost in circuit breaker tracker
      circuitBreaker.recordCost(costUsd);

      return {
        content,
        model: actualModel,
        tokens,
        latencyMs,
        costUsd,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`OpenRouter API call timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const openRouterService = new OpenRouterService();
