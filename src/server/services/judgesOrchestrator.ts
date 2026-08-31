import {
  AdvocateResponse,
  ChargeSheet,
  DeliberationResult,
  JudgeId,
  JudgeVerdict,
} from '../types/tribunal.js';
import { JUDGE_PERSONAS, buildJudgeMessages } from '../prompts/judges.js';
import { parseJudgeVerdict } from '../utils/verdictParser.js';
import { OpenRouterService, openRouterService } from './openrouter.js';
import { circuitBreaker, CircuitBreakerError } from '../utils/circuitBreaker.js';

export interface JudgeOrchestratorOptions {
  modelMap?: Partial<Record<JudgeId, string>>;
  defaultModel?: string;
  timeoutMs?: number;
  openRouter?: OpenRouterService;
}

const JUDGE_IDS: JudgeId[] = ['judge_1', 'judge_2', 'judge_3'];

/**
 * Orchestrates 3 independent judges executing in parallel.
 * Implements SC-3 & Unmerged Protocol: returns separate verdicts (V1, V2, V3) without fusing.
 */
export async function runJudgesOrchestration(
  caseId: string,
  chargeSheet: ChargeSheet,
  advocates: AdvocateResponse[],
  options: JudgeOrchestratorOptions = {},
): Promise<DeliberationResult> {
  // Pre-check economic circuit breaker before launching judicial deliberation (Mitigation P2)
  circuitBreaker.enforceBudget();

  const service = options.openRouter ?? openRouterService;
  const startTime = performance.now();

  const judgePromises = JUDGE_IDS.map(async (judgeId): Promise<JudgeVerdict> => {
    const persona = JUDGE_PERSONAS[judgeId];
    const model = options.modelMap?.[judgeId] ?? options.defaultModel;
    const judgeStartTime = performance.now();

    try {
      const messages = buildJudgeMessages(judgeId, chargeSheet, advocates);
      const result = await service.completeChat({
        model,
        messages,
        timeoutMs: options.timeoutMs,
      });

      const parsed = parseJudgeVerdict(result.content);

      return {
        judgeId,
        personaName: persona.personaName,
        verdict: parsed.verdict,
        reasoning: parsed.reasoning,
        dissentPoints: parsed.dissentPoints,
        model: result.model,
        tokens: result.tokens,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd,
        status: 'success',
      };
    } catch (err: unknown) {
      if (err instanceof CircuitBreakerError) {
        throw err;
      }

      const latencyMs = Math.round(performance.now() - judgeStartTime);
      const errorMessage = err instanceof Error ? err.message : 'Unknown judge error';

      return {
        judgeId,
        personaName: persona.personaName,
        verdict: 'undecided',
        reasoning: '',
        dissentPoints: [],
        model: model ?? 'unknown',
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs,
        costUsd: 0,
        status: 'error',
        error: errorMessage,
      };
    }
  });

  // Execute all 3 judges in parallel
  const verdicts = await Promise.all(judgePromises);
  const totalLatencyMs = Math.round(performance.now() - startTime);

  const totalTokens = verdicts.reduce((sum, v) => sum + v.tokens.totalTokens, 0);
  const totalCostUsd = Number(
    verdicts.reduce((sum, v) => sum + v.costUsd, 0).toFixed(8),
  );

  const successCount = verdicts.filter((v) => v.status === 'success').length;
  let status: DeliberationResult['status'] = 'completed';
  if (successCount === 0) {
    status = 'failed';
  } else if (successCount < verdicts.length) {
    status = 'partial_failure';
  }

  return {
    caseId,
    verdicts,
    totalTokens,
    totalCostUsd,
    totalLatencyMs,
    status,
  };
}
