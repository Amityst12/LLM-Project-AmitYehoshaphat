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
 * Service to execute chat completions via OpenRouter API with offline deterministic simulation support.
 */
export class OpenRouterService {
  private apiKey: string | undefined;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl = 'https://openrouter.ai/api/v1') {
    this.apiKey = apiKey ?? process.env.OPENROUTER_API_KEY;
    this.baseUrl = baseUrl;
  }

  public isSimulationMode(): boolean {
    const key = this.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!key) return true;
    const trimmed = key.trim().toLowerCase();
    return (
      trimmed === 'mock' ||
      trimmed === 'simulation' ||
      trimmed === 'demo' ||
      trimmed === 'test-key' ||
      trimmed.startsWith('sk-your') ||
      trimmed.includes('placeholder')
    );
  }

  public async completeChat(
    params: OpenRouterCompletionParams,
  ): Promise<OpenRouterCompletionResult> {
    // 1. Enforce budget ceiling (Mitigation P2)
    circuitBreaker.enforceBudget();

    const model = params.model ?? DEFAULT_MODEL;
    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // 2. Offline Simulation / Demo Mode when no live API key is configured
    if (this.isSimulationMode()) {
      return this.generateSimulatedCompletion(params, model);
    }

    const key = this.apiKey ?? process.env.OPENROUTER_API_KEY;
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

      // Record cost in circuit breaker tracker
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

  /**
   * Deterministic simulation generator for offline demonstration and deterministic test runs.
   */
  private generateSimulatedCompletion(
    params: OpenRouterCompletionParams,
    model: string,
  ): OpenRouterCompletionResult {
    const sysPrompt = params.messages.find((m) => m.role === 'system')?.content || '';
    const userPrompt = params.messages.find((m) => m.role === 'user')?.content || '';

    // Extract defendant and act if present
    const defendantMatch = userPrompt.match(/<defendant>(.*?)<\/defendant>/);
    const defendant = defendantMatch ? defendantMatch[1] : 'The Defendant';

    let content = '';

    // Advocates Simulation
    if (sysPrompt.includes('Deontologist')) {
      content = `The conduct of ${defendant} represents an impermissible departure from foundational legal and ethical duties. Under strict categorical principles, a duty of care is non-negotiable and cannot be subordinated to convenience or private gain.\n\nBy executing the alleged act, ${defendant} breached established statutory boundaries. When foundational rules are violated, liability must follow as a matter of universal principle regardless of mitigating post-hoc rationalizations.`;
    } else if (sysPrompt.includes('Utilitarian')) {
      content = `A rigorous aggregate consequence analysis reveals substantial negative externalities stemming from ${defendant}'s actions. The societal harm, erosion of institutional trust, and dangerous market incentives far outweigh any localized benefits.\n\nFailing to establish clear liability will create perverse systemic incentives for other market participants. To minimize long-term societal risk and maximize net public welfare, an affirmative finding of culpability is necessary for future deterrence.`;
    } else if (sysPrompt.includes('Humanist')) {
      content = `We must examine the actions of ${defendant} within their full humane context and operational constraints. The record demonstrates that the defendant acted in good faith under high ambiguity and extenuating circumstances rather than malicious intent.\n\nRigid punitive formalisms fail to account for human vulnerability and complex trade-offs. Equity and restorative justice counsel against imposing severe liability where systemic conditions forced difficult probabilistic choices.`;
    } else if (sysPrompt.includes('Realist') && !sysPrompt.includes('Judge')) {
      content = `The prosecution's case against ${defendant} relies upon selective enforcement and an unwarranted expansion of regulatory authority. Establishing liability here sets a dangerous precedent that would chill legitimate technological and operational innovation.\n\nFurthermore, the governing framework itself suffers from jurisdictional ambiguities and power asymmetries. Condemning ${defendant} under vaguely formulated post-hoc standards threatens the rule of law more than the alleged conduct itself.`;
    }
    // Judges Simulation (JSON schema enforcement)
    else if (sysPrompt.includes('Textualist')) {
      content = JSON.stringify({
        verdict: 'guilty',
        reasoning: `Judge 1 (The Textualist): Applying strict statutory interpretation to the Charge Sheet, ${defendant} engaged in conduct that clearly meets the defined legal thresholds for a breach of duty. The evidentiary burden was met by the prosecution's formalist arguments, and the defense failed to establish an affirmative statutory exemption.`,
        dissent_points: [
          'Humanist advocate raised equitable concerns, but equity cannot supersede explicit text.',
          'Skeptic advocate challenged regulatory jurisdiction, which this court affirms.',
        ],
      });
    } else if (sysPrompt.includes('Pragmatist')) {
      content = JSON.stringify({
        verdict: 'not_guilty',
        reasoning: `Judge 2 (The Pragmatist): Assessing the systemic economic equilibrium and institutional ramifications, finding ${defendant} culpable under existing rules would produce severe chilling effects across the sector. A pragmatic balance favors establishing regulatory clarity going forward rather than retroactive liability.`,
        dissent_points: [
          'Utilitarian advocate demonstrated non-trivial aggregate externalities.',
          'Deontologist argued categorical breach regardless of economic consequences.',
        ],
      });
    } else if (sysPrompt.includes('Natural Law')) {
      content = JSON.stringify({
        verdict: 'undecided',
        reasoning: `Judge 3 (The Natural Law / Moralist): The case presents an irreconcilable dialectical tension between individual human dignity and collective utility. While ${defendant} acted with arguable necessity, the core moral rights of affected parties cannot be disregarded. The ethical record remains fundamentally divided.`,
        dissent_points: [
          'Tension between categorical moral duty and utilitarian societal welfare remains unbridged.',
          'Pro and Con advocates each presented valid foundational principles.',
        ],
      });
    } else {
      content = JSON.stringify({
        verdict: 'undecided',
        reasoning: 'Deliberation completed with balanced perspectives across all arguments.',
        dissent_points: [],
      });
    }

    const tokens: TokenUsage = {
      promptTokens: 250,
      completionTokens: 140,
      totalTokens: 390,
    };

    const latencyMs = 85;
    const costUsd = calculateTokenCostUsd(model, tokens.promptTokens, tokens.completionTokens);

    circuitBreaker.recordCost(costUsd);

    return {
      content,
      model,
      tokens,
      latencyMs,
      costUsd,
    };
  }
}

export const openRouterService = new OpenRouterService();
